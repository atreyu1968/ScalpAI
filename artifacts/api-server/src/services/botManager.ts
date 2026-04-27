import { eq, and, desc } from "drizzle-orm";
import { db, botsTable, tradeLogsTable, type Bot } from "@workspace/db";
import { marketData } from "./marketData";
import { dataProcessor } from "./dataProcessor";
import { checkStopLoss, checkDailyDrawdown, checkWeeklyDrawdown, pauseBot, pauseBotUntilNextMonday } from "./riskManager";
import { openPaperTrade, closePaperTrade } from "./paperTrading";
import { openLiveTrade, closeLiveTrade } from "./liveTrading";
import { tradingEvents } from "./tradingEvents";
import { logger } from "../lib/logger";
import { warmupSymbol } from "./warmup";
import { getRoundTripFeePct } from "./fees";
import {
  clearPendingOrder as clearTrendPullbackPendingOrder,
  clearLastDecision as clearTrendPullbackLastDecision,
  evaluateLogicalExit as evaluateTrendPullbackLogicalExit,
  recordExternalDecision as recordTrendPullbackDecision,
  preloadTrendPullbackKlines,
} from "./trendPullback";

async function closeAllOpenTrades(botId: number, bot: Bot): Promise<void> {
  const openTrades = await db
    .select()
    .from(tradeLogsTable)
    .where(
      and(
        eq(tradeLogsTable.botId, botId),
        eq(tradeLogsTable.status, "open"),
      ),
    );

  for (const trade of openTrades) {
    try {
      if (trade.mode === "paper") {
        await closePaperTrade(trade.id, bot);
      } else {
        await closeLiveTrade(trade.id, bot, true);
      }
      tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "kill" } });
      logger.info({ botId, tradeId: trade.id }, "Emergency closed open trade during kill");
    } catch (err: unknown) {
      logger.error({ err, botId, tradeId: trade.id }, "Failed to emergency close trade");
    }
  }
}

const MONITOR_INTERVAL_MS = 2000;

export type TradeSignal = {
  side: "long" | "short";
  confidence?: number;
  signal?: string;
  takeProfitPct?: number;
  tp1Pct?: number;
  tp2Pct?: number;
  tp3Pct?: number;
  dynamicStopPct?: number;
  positionSizeUsdt?: number;
};

export type SignalProvider = (bot: Bot) => Promise<TradeSignal | null>;

class BotManager {
  private monitorIntervals: Map<number, ReturnType<typeof setInterval>> = new Map();
  private runningBots: Map<number, Bot> = new Map();
  private signalProvider: SignalProvider | null = null;
  private lastReversalTime: Map<number, number> = new Map();
  private static REVERSAL_COOLDOWN_MS = 600_000;
  private static REVERSAL_CONFIDENCE_BONUS = 25;
  private static MIN_TRADE_AGE_FOR_REVERSAL_MS = 300_000;
  private static MAX_TRADE_DURATION_MS = 30 * 60 * 1000;
  private static BASELINE_VOLATILITY_PCT = 0.10;
  private static MIN_DURATION_MULTIPLIER = 0.5;
  private static MAX_DURATION_MULTIPLIER = 2.0;
  private static MAX_CONSECUTIVE_LOSSES_DEFAULT = 3;
  private static MAX_CONSECUTIVE_LOSSES_TREND_PULLBACK = 2;

  private getMaxConsecutiveLosses(bot: Bot): number {
    return bot.strategy === "trend_pullback"
      ? BotManager.MAX_CONSECUTIVE_LOSSES_TREND_PULLBACK
      : BotManager.MAX_CONSECUTIVE_LOSSES_DEFAULT;
  }

  private computeDynamicMaxDuration(bot: Bot): number {
    const useFutures = bot.marketType === "futures";
    const volatility = dataProcessor.getVolatility(bot.pair, useFutures);
    if (volatility === null || volatility <= 0) {
      return BotManager.MAX_TRADE_DURATION_MS;
    }
    const rawMultiplier = BotManager.BASELINE_VOLATILITY_PCT / volatility;
    const multiplier = Math.max(
      BotManager.MIN_DURATION_MULTIPLIER,
      Math.min(BotManager.MAX_DURATION_MULTIPLIER, rawMultiplier),
    );
    return BotManager.MAX_TRADE_DURATION_MS * multiplier;
  }

  setSignalProvider(provider: SignalProvider): void {
    this.signalProvider = provider;
  }

  async startBot(botId: number): Promise<{ success: boolean; error?: string }> {
    const [bot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, botId));

    if (!bot) return { success: false, error: "Bot not found" };

    if (bot.status === "running" && this.runningBots.has(botId)) {
      return { success: false, error: "Bot is already running" };
    }

    if (bot.pausedUntil && bot.pausedUntil > new Date()) {
      await db
        .update(botsTable)
        .set({ pausedUntil: null, pauseReason: null })
        .where(eq(botsTable.id, botId));
      logger.info({ botId }, "Cleared pause on manual start");
    }

    if (bot.mode === "live" && !bot.apiKeyId) {
      return { success: false, error: "Live trading requires an API key" };
    }

    const normalizedPair = bot.pair.trim().toUpperCase();
    if (!/^[A-Z0-9]+\/[A-Z0-9]+$/.test(normalizedPair)) {
      return { success: false, error: `Invalid trading pair format: ${bot.pair}. Expected format: BASE/QUOTE (e.g. BTC/USDT)` };
    }

    const useFutures = bot.marketType === "futures";
    marketData.subscribe(bot.pair, useFutures);

    // Para AI: precarga 1m/5m. Para trend_pullback: precarga 1h/4h (y BTC ref
    // si es ETH) en paralelo, así el primer ciclo ya tiene datos suficientes.
    await Promise.all([
      warmupSymbol(bot.pair, useFutures),
      bot.strategy === "trend_pullback"
        ? preloadTrendPullbackKlines(bot.pair).catch((err) => {
            logger.warn({ err, botId, pair: bot.pair }, "preloadTrendPullbackKlines failed (non-blocking)");
          })
        : Promise.resolve(),
    ]);

    await this.reconcileOpenTrades(botId, bot);

    await db
      .update(botsTable)
      .set({ status: "running", pausedUntil: null })
      .where(eq(botsTable.id, botId));

    const updatedBot = { ...bot, status: "running" as const, pausedUntil: null };
    this.runningBots.set(botId, updatedBot);
    this.startMonitoring(botId);

    tradingEvents.emitTradeEvent({ type: "bot_started", userId: bot.userId, botId });
    logger.info({ botId, pair: bot.pair, mode: bot.mode }, "Bot started");
    return { success: true };
  }

  async stopBot(botId: number): Promise<{ success: boolean; error?: string }> {
    this.stopMonitoring(botId);
    const bot = this.runningBots.get(botId);

    if (bot) {
      const useFutures = bot.marketType === "futures";
      marketData.unsubscribe(bot.pair, useFutures);
      this.runningBots.delete(botId);
    }

    clearTrendPullbackPendingOrder(botId);
    clearTrendPullbackLastDecision(botId);

    const [current] = await db
      .select({ status: botsTable.status })
      .from(botsTable)
      .where(eq(botsTable.id, botId));

    if (current && current.status !== "paused") {
      await db
        .update(botsTable)
        .set({ status: "stopped" })
        .where(eq(botsTable.id, botId));
    }

    if (bot) {
      tradingEvents.emitTradeEvent({ type: "bot_stopped", userId: bot.userId, botId });
    }
    logger.info({ botId }, "Bot stopped");
    return { success: true };
  }

  async killBot(botId: number): Promise<{ success: boolean; error?: string }> {
    const bot = this.runningBots.get(botId);
    if (bot) {
      await closeAllOpenTrades(botId, bot);
    } else {
      const [dbBot] = await db
        .select()
        .from(botsTable)
        .where(eq(botsTable.id, botId));
      if (dbBot) {
        await closeAllOpenTrades(botId, dbBot);
      }
    }
    return this.stopBot(botId);
  }

  async pauseBotRuntime(botId: number, reason: string, until?: Date): Promise<void> {
    this.stopMonitoring(botId);
    const bot = this.runningBots.get(botId);

    if (bot) {
      const useFutures = bot.marketType === "futures";
      marketData.unsubscribe(bot.pair, useFutures);
      this.runningBots.delete(botId);
    }

    clearTrendPullbackPendingOrder(botId);
    clearTrendPullbackLastDecision(botId);

    await pauseBot(botId, reason, until);
    if (bot) {
      tradingEvents.emitTradeEvent({ type: "bot_paused", userId: bot.userId, botId, data: { reason } });
    }
    logger.warn({ botId, reason, pausedUntil: until?.toISOString() }, "Bot paused at runtime");
  }

  async pauseBotRuntimeUntilNextMonday(botId: number, reason: string): Promise<void> {
    this.stopMonitoring(botId);
    const bot = this.runningBots.get(botId);

    if (bot) {
      const useFutures = bot.marketType === "futures";
      marketData.unsubscribe(bot.pair, useFutures);
      this.runningBots.delete(botId);
    }

    clearTrendPullbackPendingOrder(botId);
    clearTrendPullbackLastDecision(botId);

    await pauseBotUntilNextMonday(botId, reason);
    if (bot) {
      tradingEvents.emitTradeEvent({ type: "bot_paused", userId: bot.userId, botId, data: { reason } });
    }
    logger.warn({ botId, reason }, "Bot paused until next Monday by weekly drawdown");
  }

  private async reconcileOpenTrades(botId: number, bot: Bot): Promise<void> {
    const openTrades = await db
      .select()
      .from(tradeLogsTable)
      .where(
        and(
          eq(tradeLogsTable.botId, botId),
          eq(tradeLogsTable.status, "open"),
        ),
      );

    if (openTrades.length === 0) return;

    for (const trade of openTrades) {
      const tradeAge = Date.now() - new Date(trade.openedAt).getTime();

      if (tradeAge >= BotManager.MAX_TRADE_DURATION_MS) {
        logger.warn(
          { botId, tradeId: trade.id, ageMs: tradeAge },
          "Reconciliación: trade expirado durante downtime, cerrando",
        );
        if (trade.mode === "paper") {
          await closePaperTrade(trade.id, bot);
        } else {
          await closeLiveTrade(trade.id, bot, false);
        }
        tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "timeout_reconcile" } });
        continue;
      }

      const symbol = bot.pair.replace("/", "").toLowerCase();
      const useFutures = bot.marketType === "futures";
      const obKey = useFutures ? `f:${symbol}` : symbol;
      const ob = marketData.getOrderBook(obKey);
      if (!ob || ob.bids.length === 0 || ob.asks.length === 0) {
        logger.info({ botId, tradeId: trade.id }, "Reconciliación: sin datos de order book, el monitoreo normal lo gestionará");
        continue;
      }

      const currentPrice = trade.side === "long" ? ob.bids[0].price : ob.asks[0].price;
      const entryPrice = parseFloat(trade.entryPrice);
      const pctChange = trade.side === "long"
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;
      const effectiveSlPct = trade.dynamicStopPct ? parseFloat(trade.dynamicStopPct) : parseFloat(bot.stopLossPercent);
      const tpLevel = trade.tpLevelReached;
      const tp1 = trade.aiTp1Pct ? parseFloat(trade.aiTp1Pct) : 0;
      const feeAdjBreakeven = getRoundTripFeePct(bot);
      const isTrendPullback = bot.strategy === "trend_pullback";
      const trailingPrice = trade.trailingStopPrice ? parseFloat(trade.trailingStopPrice) : null;

      if (isTrendPullback && trailingPrice !== null && tpLevel >= 1) {
        const trailingHit = trade.side === "long" ? currentPrice <= trailingPrice : currentPrice >= trailingPrice;
        if (trailingHit) {
          logger.warn(
            { botId, tradeId: trade.id, currentPrice, trailingPrice },
            "Reconciliación: trailing stop debió activarse durante downtime, cerrando",
          );
          if (trade.mode === "paper") {
            await closePaperTrade(trade.id, bot);
          } else {
            await closeLiveTrade(trade.id, bot, false);
          }
          tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "trailing_stop_reconcile" } });
          continue;
        }
      }

      let slThreshold: number;
      if (isTrendPullback && tpLevel >= 1) {
        slThreshold = trailingPrice !== null ? Number.NEGATIVE_INFINITY : feeAdjBreakeven;
      } else {
        slThreshold = tpLevel >= 2 ? -tp1 : tpLevel >= 1 ? feeAdjBreakeven : -effectiveSlPct;
      }

      if (pctChange <= slThreshold) {
        logger.warn(
          { botId, tradeId: trade.id, pctChange: pctChange.toFixed(4), slThreshold },
          "Reconciliación: stop-loss debió activarse durante downtime, cerrando",
        );
        if (trade.mode === "paper") {
          await closePaperTrade(trade.id, bot);
        } else {
          await closeLiveTrade(trade.id, bot, true);
        }
        tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "stop_loss_reconcile" } });
        continue;
      }

      logger.info(
        { botId, tradeId: trade.id, side: trade.side, entryPrice, currentPrice, pctChange: pctChange.toFixed(4), tradeAgeMs: tradeAge },
        "Reconciliación: trade abierto válido, continuando monitoreo",
      );
    }
  }

  private startMonitoring(botId: number): void {
    if (this.monitorIntervals.has(botId)) return;

    const interval = setInterval(async () => {
      try {
        await this.executeCycle(botId);
      } catch (err: unknown) {
        logger.error({ err, botId }, "Error in bot execution cycle");
      }
    }, MONITOR_INTERVAL_MS);

    this.monitorIntervals.set(botId, interval);
  }

  private stopMonitoring(botId: number): void {
    const interval = this.monitorIntervals.get(botId);
    if (interval) {
      clearInterval(interval);
      this.monitorIntervals.delete(botId);
    }
  }

  private async executeCycle(botId: number): Promise<void> {
    const bot = this.runningBots.get(botId);
    if (!bot) return;

    const [freshBot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, botId));

    if (!freshBot || freshBot.status !== "running") {
      await this.stopBot(botId);
      return;
    }

    this.runningBots.set(botId, freshBot);

    const drawdownCheck = checkDailyDrawdown(freshBot);
    if (!drawdownCheck.allowed) {
      await this.pauseBotRuntime(botId, drawdownCheck.reason!);
      return;
    }

    const weeklyCheck = checkWeeklyDrawdown(freshBot);
    if (!weeklyCheck.allowed) {
      await this.pauseBotRuntimeUntilNextMonday(botId, weeklyCheck.reason!);
      return;
    }

    await this.monitorOpenTrades(botId, freshBot);

    const [postTradeBot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, botId));

    if (!postTradeBot || postTradeBot.status !== "running") {
      if (postTradeBot && postTradeBot.status === "paused") {
        this.stopMonitoring(botId);
        const runBot = this.runningBots.get(botId);
        if (runBot) {
          const useFutures = runBot.marketType === "futures";
          marketData.unsubscribe(runBot.pair, useFutures);
          this.runningBots.delete(botId);
        }
      }
      return;
    }

    const postDrawdownCheck = checkDailyDrawdown(postTradeBot);
    if (!postDrawdownCheck.allowed) {
      await this.pauseBotRuntime(botId, postDrawdownCheck.reason!);
      return;
    }

    const postWeeklyCheck = checkWeeklyDrawdown(postTradeBot);
    if (!postWeeklyCheck.allowed) {
      await this.pauseBotRuntimeUntilNextMonday(botId, postWeeklyCheck.reason!);
      return;
    }

    this.runningBots.set(botId, postTradeBot);
    this.checkForSignals(botId, postTradeBot).catch((err: unknown) => {
      logger.error({ err, botId }, "checkForSignals failed (non-blocking)");
    });
  }

  private async monitorOpenTrades(botId: number, bot: Bot): Promise<void> {
    const openTrades = await db
      .select()
      .from(tradeLogsTable)
      .where(
        and(
          eq(tradeLogsTable.botId, botId),
          eq(tradeLogsTable.status, "open"),
        ),
      );

    for (const trade of openTrades) {
      const symbol = bot.pair.replace("/", "").toLowerCase();
      const useFutures = bot.marketType === "futures";
      const obKey = useFutures ? `f:${symbol}` : symbol;
      const ob = marketData.getOrderBook(obKey);
      if (!ob || ob.bids.length === 0 || ob.asks.length === 0) continue;

      // Cierre lógico (sólo trend_pullback): si la tesis del trade se invalida
      // — tendencia 4H rota, cruce EMA bajista o ruptura de estructura 1H —
      // el bot cierra a mercado independientemente de los SL/TP marcados.
      // Esto se evalúa ANTES que los chequeos de precio para que un cierre
      // por motivos lógicos no se "coma" un SL/TP que se hubiera disparado
      // en el mismo ciclo (preferimos el motivo lógico explícito).
      if (bot.strategy === "trend_pullback") {
        const exitDecision = evaluateTrendPullbackLogicalExit(bot);
        if (exitDecision.shouldExit) {
          logger.warn(
            { botId, tradeId: trade.id, reason: exitDecision.reason, details: exitDecision.details },
            "Trend-Pullback: cierre lógico — tesis invalidada",
          );
          if (trade.mode === "paper") {
            await closePaperTrade(trade.id, bot);
          } else {
            await closeLiveTrade(trade.id, bot, false);
          }
          tradingEvents.emitTradeEvent({
            type: "trade_closed",
            userId: bot.userId,
            botId,
            tradeId: trade.id,
            data: { reason: "logical_exit", logicalReason: exitDecision.reason, details: exitDecision.details },
          });
          recordTrendPullbackDecision(botId, {
            signal: null,
            reason: exitDecision.reason,
            details: { ...exitDecision.details, closedTradeId: trade.id, logicalExit: true },
          });
          continue;
        }
      }

      const currentPrice = trade.side === "long" ? ob.bids[0].price : ob.asks[0].price;
      const entryPrice = parseFloat(trade.entryPrice);

      let pctChange: number;
      if (trade.side === "long") {
        pctChange = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else {
        pctChange = ((entryPrice - currentPrice) / entryPrice) * 100;
      }

      const tp1 = trade.aiTp1Pct ? parseFloat(trade.aiTp1Pct) : 0;
      const tp2 = trade.aiTp2Pct ? parseFloat(trade.aiTp2Pct) : 0;
      const tp3 = trade.aiTp3Pct ? parseFloat(trade.aiTp3Pct) : 0;
      const tpLevel = trade.tpLevelReached;
      const isTrendPullback = bot.strategy === "trend_pullback";
      const tp1Share = isTrendPullback ? 0.50 : 0.40;
      const tp2Share = isTrendPullback ? 0.30 : 0.35;
      const oneRpct = trade.dynamicStopPct ? parseFloat(trade.dynamicStopPct) : 0;
      const trailingActivationPct = oneRpct * 2;
      const trailingBufferPct = oneRpct;

      if (tp1 > 0 && tp2 > 0 && tp3 > 0) {
        if (tpLevel === 0 && pctChange >= tp1) {
          const totalQty = parseFloat(trade.quantity);
          const closeQty = totalQty * tp1Share;
          const remaining = totalQty - closeQty;
          const partialPnl = trade.side === "long"
            ? (currentPrice - entryPrice) * closeQty
            : (entryPrice - currentPrice) * closeQty;
          const prevRealized = parseFloat(trade.realizedPnl || "0");

          await db.update(tradeLogsTable).set({
            tpLevelReached: 1,
            remainingQuantity: remaining.toFixed(8),
            realizedPnl: (prevRealized + partialPnl).toFixed(8),
          }).where(eq(tradeLogsTable.id, trade.id));

          tradingEvents.emitTradeEvent({ type: "tp_hit", userId: bot.userId, botId, tradeId: trade.id, data: { level: 1, pctChange } });
          logger.info(
            { botId, tradeId: trade.id, level: "TP1", pctChange: pctChange.toFixed(4), target: tp1, closedPct: `${(tp1Share * 100).toFixed(0)}%`, partialPnl: partialPnl.toFixed(4) },
            "TP1 alcanzado — cierre parcial, SL movido a breakeven",
          );
          continue;
        }

        if (tpLevel === 1 && pctChange >= tp2) {
          const remainingQty = parseFloat(trade.remainingQuantity || trade.quantity);
          const closeQty = parseFloat(trade.quantity) * tp2Share;
          const remaining = remainingQty - closeQty;
          const partialPnl = trade.side === "long"
            ? (currentPrice - entryPrice) * closeQty
            : (entryPrice - currentPrice) * closeQty;
          const prevRealized = parseFloat(trade.realizedPnl || "0");

          let seededTrailingPrice: string | null = null;
          if (isTrendPullback && oneRpct > 0) {
            const bufferRatio = trailingBufferPct / 100;
            const candidateTrailing = trade.side === "long"
              ? currentPrice * (1 - bufferRatio)
              : currentPrice * (1 + bufferRatio);
            const currentTrailing = trade.trailingStopPrice ? parseFloat(trade.trailingStopPrice) : null;
            const shouldUpdate = currentTrailing === null
              || (trade.side === "long" ? candidateTrailing > currentTrailing : candidateTrailing < currentTrailing);
            if (shouldUpdate) {
              seededTrailingPrice = candidateTrailing.toFixed(8);
            }
          }

          await db.update(tradeLogsTable).set({
            tpLevelReached: 2,
            remainingQuantity: remaining.toFixed(8),
            realizedPnl: (prevRealized + partialPnl).toFixed(8),
            ...(seededTrailingPrice !== null ? { trailingStopPrice: seededTrailingPrice } : {}),
          }).where(eq(tradeLogsTable.id, trade.id));

          if (seededTrailingPrice !== null) {
            const prevTrailing = trade.trailingStopPrice;
            trade.trailingStopPrice = seededTrailingPrice;
            if (prevTrailing === null || prevTrailing === undefined) {
              logger.info(
                { botId, tradeId: trade.id, trailing: seededTrailingPrice, bufferPct: trailingBufferPct.toFixed(3), pctChange: pctChange.toFixed(4) },
                "Trailing stop activado al alcanzar TP2 (>+2R)",
              );
            }
          }

          tradingEvents.emitTradeEvent({ type: "tp_hit", userId: bot.userId, botId, tradeId: trade.id, data: { level: 2, pctChange } });
          logger.info(
            { botId, tradeId: trade.id, level: "TP2", pctChange: pctChange.toFixed(4), target: tp2, closedPct: `${(tp2Share * 100).toFixed(0)}%`, partialPnl: partialPnl.toFixed(4) },
            isTrendPullback
              ? "TP2 alcanzado — cierre parcial, restante gestionado por trailing"
              : "TP2 alcanzado — cierre parcial, SL movido a TP1",
          );
          continue;
        }

        if (isTrendPullback) {
          if (tpLevel >= 1 && oneRpct > 0 && pctChange >= trailingActivationPct) {
            const bufferRatio = trailingBufferPct / 100;
            const candidateTrailing = trade.side === "long"
              ? currentPrice * (1 - bufferRatio)
              : currentPrice * (1 + bufferRatio);
            const currentTrailing = trade.trailingStopPrice ? parseFloat(trade.trailingStopPrice) : null;
            const shouldUpdate = currentTrailing === null
              || (trade.side === "long" ? candidateTrailing > currentTrailing : candidateTrailing < currentTrailing);
            if (shouldUpdate) {
              await db.update(tradeLogsTable).set({
                trailingStopPrice: candidateTrailing.toFixed(8),
              }).where(eq(tradeLogsTable.id, trade.id));
              trade.trailingStopPrice = candidateTrailing.toFixed(8);
              if (currentTrailing === null) {
                logger.info(
                  { botId, tradeId: trade.id, trailing: candidateTrailing.toFixed(8), bufferPct: trailingBufferPct.toFixed(3), pctChange: pctChange.toFixed(4) },
                  "Trailing stop activado tras superar +2R",
                );
              }
            }
          }

          const trailingPrice = trade.trailingStopPrice ? parseFloat(trade.trailingStopPrice) : null;
          if (trailingPrice !== null && tpLevel >= 1) {
            const triggered = trade.side === "long" ? currentPrice <= trailingPrice : currentPrice >= trailingPrice;
            if (triggered) {
              logger.info(
                { botId, tradeId: trade.id, currentPrice, trailingPrice, pctChange: pctChange.toFixed(4) },
                "Trailing stop alcanzado, cerrando restante",
              );
              if (trade.mode === "paper") {
                await closePaperTrade(trade.id, bot);
              } else {
                await closeLiveTrade(trade.id, bot, false);
              }
              tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "trailing_stop" } });
              continue;
            }
          }

          if (tpLevel === 1 && trailingPrice === null && pctChange <= 0) {
            logger.info(
              { botId, tradeId: trade.id, pctChange: pctChange.toFixed(4) },
              "SL breakeven alcanzado post-TP1 (trailing inactivo), cerrando trade",
            );
            if (trade.mode === "paper") {
              await closePaperTrade(trade.id, bot);
            } else {
              await closeLiveTrade(trade.id, bot, false);
            }
            tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "sl_breakeven" } });
            continue;
          }
        } else {
          if (tpLevel === 2 && pctChange >= tp3) {
            await db.update(tradeLogsTable).set({
              tpLevelReached: 3,
            }).where(eq(tradeLogsTable.id, trade.id));

            tradingEvents.emitTradeEvent({ type: "tp_hit", userId: bot.userId, botId, tradeId: trade.id, data: { level: 3, pctChange } });
            logger.info(
              { botId, tradeId: trade.id, level: "TP3", pctChange: pctChange.toFixed(4), target: tp3 },
              "TP3 alcanzado — cerrando 25% restante, trade completado",
            );
            if (trade.mode === "paper") {
              await closePaperTrade(trade.id, bot);
            } else {
              await closeLiveTrade(trade.id, bot, false);
            }
            tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "tp3" } });
            continue;
          }

          if (tpLevel === 1 && pctChange <= 0) {
            logger.info(
              { botId, tradeId: trade.id, pctChange: pctChange.toFixed(4) },
              "SL breakeven alcanzado post-TP1, cerrando trade",
            );
            if (trade.mode === "paper") {
              await closePaperTrade(trade.id, bot);
            } else {
              await closeLiveTrade(trade.id, bot, false);
            }
            tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "sl_breakeven" } });
            continue;
          }

          if (tpLevel === 2 && pctChange <= tp1) {
            logger.info(
              { botId, tradeId: trade.id, pctChange: pctChange.toFixed(4), slAt: tp1 },
              "SL en TP1 alcanzado post-TP2, cerrando trade",
            );
            if (trade.mode === "paper") {
              await closePaperTrade(trade.id, bot);
            } else {
              await closeLiveTrade(trade.id, bot, false);
            }
            tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "sl_tp1" } });
            continue;
          }
        }
      } else {
        const aiTp = trade.aiTakeProfitPct ? parseFloat(trade.aiTakeProfitPct) : 0;
        if (aiTp > 0 && pctChange >= aiTp) {
          logger.info(
            { botId, tradeId: trade.id, pctChange: pctChange.toFixed(4), target: aiTp },
            "Take-profit IA alcanzado, cerrando trade",
          );
          if (trade.mode === "paper") {
            await closePaperTrade(trade.id, bot);
          } else {
            await closeLiveTrade(trade.id, bot, false);
          }
          tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "tp" } });
          continue;
        }
      }

      const tradeAge = Date.now() - new Date(trade.openedAt).getTime();
      const dynamicMaxMs = this.computeDynamicMaxDuration(bot);
      if (tradeAge >= dynamicMaxMs) {
        if (pctChange > 0.05) {
          const extendedMax = dynamicMaxMs * 2;
          if (tradeAge < extendedMax) {
            logger.info(
              { botId, tradeId: trade.id, ageMs: tradeAge, pctChange: pctChange.toFixed(4) },
              "Trade en ganancias, extendiendo tiempo máximo",
            );
            continue;
          }
        }
        logger.info(
          { botId, tradeId: trade.id, ageMs: tradeAge, maxMs: dynamicMaxMs, pctChange: pctChange.toFixed(4) },
          "Trade expirado por tiempo máximo (dinámico), cerrando",
        );
        if (trade.mode === "paper") {
          await closePaperTrade(trade.id, bot);
        } else {
          await closeLiveTrade(trade.id, bot, false);
        }
        tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "timeout" } });
        continue;
      }

      const effectiveSlPct = trade.dynamicStopPct ? parseFloat(trade.dynamicStopPct) : parseFloat(bot.stopLossPercent);
      const feeAdjBreakeven = getRoundTripFeePct(bot);
      const trailingActive = isTrendPullback && trade.trailingStopPrice !== null;
      let slThreshold: number;
      if (isTrendPullback && tpLevel >= 1) {
        slThreshold = trailingActive ? Number.NEGATIVE_INFINITY : feeAdjBreakeven;
      } else {
        slThreshold = tpLevel >= 2 ? -tp1 : tpLevel >= 1 ? feeAdjBreakeven : -effectiveSlPct;
      }
      if (pctChange <= slThreshold) {
        const reason = tpLevel >= 2 ? `SL trailing en TP1 (${tp1}%)` : tpLevel >= 1 ? `SL breakeven post-TP1 (fee-adj +${feeAdjBreakeven.toFixed(2)}%)` : `Stop-loss: ${pctChange.toFixed(4)}%`;
        logger.warn({ botId, tradeId: trade.id, reason, pctChange: pctChange.toFixed(4) }, "Stop-loss triggered, closing trade");
        if (trade.mode === "paper") {
          await closePaperTrade(trade.id, bot);
        } else {
          await closeLiveTrade(trade.id, bot, true);
        }
        tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: trade.id, data: { reason: "stop_loss" } });
      }
    }
  }

  private async checkConsecutiveLosses(botId: number, maxLosses: number): Promise<number> {
    const recent = await db
      .select({ pnl: tradeLogsTable.pnl })
      .from(tradeLogsTable)
      .where(
        and(
          eq(tradeLogsTable.botId, botId),
          eq(tradeLogsTable.status, "closed"),
        ),
      )
      .orderBy(desc(tradeLogsTable.closedAt))
      .limit(maxLosses);

    if (recent.length < maxLosses) return recent.length === 0 ? 0 : -1;

    let streak = 0;
    for (const t of recent) {
      const pnl = parseFloat(t.pnl || "0");
      if (pnl < 0) streak++;
      else break;
    }
    return streak;
  }

  private async checkForSignals(botId: number, bot: Bot): Promise<void> {
    if (!this.signalProvider) return;

    const maxLosses = this.getMaxConsecutiveLosses(bot);
    const lossStreak = await this.checkConsecutiveLosses(botId, maxLosses);
    if (lossStreak >= maxLosses) {
      const reason = `Circuit breaker activado: ${lossStreak} pérdidas consecutivas — pausa 24h`;
      logger.warn({ botId, lossStreak, maxLosses, strategy: bot.strategy }, reason);
      await this.pauseBotRuntime(botId, reason);
      return;
    }

    const signal = await this.signalProvider(bot);

    const openTrades = await db
      .select()
      .from(tradeLogsTable)
      .where(
        and(
          eq(tradeLogsTable.botId, botId),
          eq(tradeLogsTable.status, "open"),
        ),
      );

    if (!signal) return;

    const threshold = parseFloat(bot.aiConfidenceThreshold);
    if (signal.confidence !== undefined && signal.confidence < threshold) {
      logger.debug({ botId, confidence: signal.confidence, threshold }, "Signal below confidence threshold");
      return;
    }

    if (openTrades.length > 0) {
      const currentTrade = openTrades[0];
      if (currentTrade.side !== signal.side) {
        const tradeAge = Date.now() - new Date(currentTrade.openedAt).getTime();
        if (tradeAge < BotManager.MIN_TRADE_AGE_FOR_REVERSAL_MS) {
          logger.debug(
            { botId, tradeId: currentTrade.id, tradeAgeMs: tradeAge, minAgeMs: BotManager.MIN_TRADE_AGE_FOR_REVERSAL_MS },
            "Trade demasiado reciente para invertir (whipsaw protection)",
          );
          return;
        }

        const reversalThreshold = threshold + BotManager.REVERSAL_CONFIDENCE_BONUS;
        if (signal.confidence !== undefined && signal.confidence < reversalThreshold) {
          logger.debug(
            { botId, confidence: signal.confidence, reversalThreshold },
            "Señal contraria pero confianza insuficiente para invertir",
          );
          return;
        }

        const lastReversal = this.lastReversalTime.get(botId) || 0;
        const elapsed = Date.now() - lastReversal;
        if (elapsed < BotManager.REVERSAL_COOLDOWN_MS) {
          logger.debug(
            { botId, elapsedMs: elapsed, cooldownMs: BotManager.REVERSAL_COOLDOWN_MS },
            "Cooldown de inversión activo, esperando",
          );
          return;
        }

        logger.info(
          { botId, tradeId: currentTrade.id, oldSide: currentTrade.side, newSide: signal.side, confidence: signal.confidence },
          "Señal contraria con alta confianza, cerrando trade actual para invertir posición",
        );
        if (currentTrade.mode === "paper") {
          await closePaperTrade(currentTrade.id, bot);
        } else {
          await closeLiveTrade(currentTrade.id, bot, false);
        }
        tradingEvents.emitTradeEvent({ type: "trade_closed", userId: bot.userId, botId, tradeId: currentTrade.id, data: { reason: "reversal" } });
        this.lastReversalTime.set(botId, Date.now());
      } else {
        return;
      }
    }

    logger.info({ botId, signal }, "Executing trade from signal");

    let result: { tradeId: number; entryPrice: number } | { error: string };
    if (bot.strategy === "trend_pullback" && bot.mode !== "paper") {
      logger.warn({ botId, mode: bot.mode }, "Estrategia trend_pullback solo soporta paper trading; descartando señal");
      return;
    }
    if (bot.mode === "paper") {
      result = await openPaperTrade(
        bot,
        signal.side,
        signal.confidence,
        signal.signal,
        signal.takeProfitPct,
        signal.tp1Pct,
        signal.tp2Pct,
        signal.tp3Pct,
        signal.dynamicStopPct,
        signal.positionSizeUsdt,
      );
    } else {
      result = await openLiveTrade(bot, signal.side, signal.confidence, signal.signal, signal.takeProfitPct, signal.tp1Pct, signal.tp2Pct, signal.tp3Pct);
    }
    if ("tradeId" in result) {
      tradingEvents.emitTradeEvent({ type: "trade_opened", userId: bot.userId, botId, tradeId: result.tradeId, data: { side: signal.side, confidence: signal.confidence } });
    }
  }

  getRunningBotIds(): number[] {
    return Array.from(this.runningBots.keys());
  }

  isRunning(botId: number): boolean {
    return this.runningBots.has(botId);
  }

  shutdown(): void {
    for (const botId of this.monitorIntervals.keys()) {
      this.stopMonitoring(botId);
    }
    this.runningBots.clear();
    marketData.shutdown();
  }
}

export const botManager = new BotManager();
