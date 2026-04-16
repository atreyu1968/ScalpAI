import { eq, and } from "drizzle-orm";
import { db, botsTable, tradeLogsTable, type Bot } from "@workspace/db";
import { marketData } from "./marketData";
import { dataProcessor } from "./dataProcessor";
import { checkStopLoss, checkDailyDrawdown, pauseBot } from "./riskManager";
import { openPaperTrade, closePaperTrade } from "./paperTrading";
import { openLiveTrade, closeLiveTrade } from "./liveTrading";
import { tradingEvents } from "./tradingEvents";
import { logger } from "../lib/logger";
import { warmupSymbol } from "./warmup";

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

  private computeDynamicMaxDuration(bot: Bot): number {
    const useFutures = bot.mode === "live" && bot.leverage > 1;
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
        .set({ pausedUntil: null })
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

    const useFutures = bot.mode === "live" && bot.leverage > 1;
    marketData.subscribe(bot.pair, useFutures);

    await warmupSymbol(bot.pair, useFutures);

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
      const useFutures = bot.mode === "live" && bot.leverage > 1;
      marketData.unsubscribe(bot.pair, useFutures);
      this.runningBots.delete(botId);
    }

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

  async pauseBotRuntime(botId: number, reason: string): Promise<void> {
    this.stopMonitoring(botId);
    const bot = this.runningBots.get(botId);

    if (bot) {
      const useFutures = bot.mode === "live" && bot.leverage > 1;
      marketData.unsubscribe(bot.pair, useFutures);
      this.runningBots.delete(botId);
    }

    await pauseBot(botId, reason);
    if (bot) {
      tradingEvents.emitTradeEvent({ type: "bot_paused", userId: bot.userId, botId, data: { reason } });
    }
    logger.warn({ botId, reason }, "Bot paused at runtime");
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
      const useFutures = bot.mode === "live" && bot.leverage > 1;
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
      const effectiveSlPct = parseFloat(bot.stopLossPercent);
      const tpLevel = trade.tpLevelReached;
      const tp1 = trade.aiTp1Pct ? parseFloat(trade.aiTp1Pct) : 0;
      const slThreshold = tpLevel >= 2 ? -tp1 : tpLevel >= 1 ? 0 : -effectiveSlPct;

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
          const useFutures = runBot.mode === "live" && runBot.leverage > 1;
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
      const useFutures = bot.mode === "live" && bot.leverage > 1;
      const obKey = useFutures ? `f:${symbol}` : symbol;
      const ob = marketData.getOrderBook(obKey);
      if (!ob || ob.bids.length === 0 || ob.asks.length === 0) continue;

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

      if (tp1 > 0 && tp2 > 0 && tp3 > 0) {
        if (tpLevel === 0 && pctChange >= tp1) {
          const totalQty = parseFloat(trade.quantity);
          const closeQty = totalQty * 0.40;
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
            { botId, tradeId: trade.id, level: "TP1", pctChange: pctChange.toFixed(4), target: tp1, closedPct: "40%", partialPnl: partialPnl.toFixed(4) },
            "TP1 alcanzado — cerrado 40%, SL movido a breakeven",
          );
          continue;
        }

        if (tpLevel === 1 && pctChange >= tp2) {
          const remainingQty = parseFloat(trade.remainingQuantity || trade.quantity);
          const closeQty = parseFloat(trade.quantity) * 0.35;
          const remaining = remainingQty - closeQty;
          const partialPnl = trade.side === "long"
            ? (currentPrice - entryPrice) * closeQty
            : (entryPrice - currentPrice) * closeQty;
          const prevRealized = parseFloat(trade.realizedPnl || "0");

          await db.update(tradeLogsTable).set({
            tpLevelReached: 2,
            remainingQuantity: remaining.toFixed(8),
            realizedPnl: (prevRealized + partialPnl).toFixed(8),
          }).where(eq(tradeLogsTable.id, trade.id));

          tradingEvents.emitTradeEvent({ type: "tp_hit", userId: bot.userId, botId, tradeId: trade.id, data: { level: 2, pctChange } });
          logger.info(
            { botId, tradeId: trade.id, level: "TP2", pctChange: pctChange.toFixed(4), target: tp2, closedPct: "35%", partialPnl: partialPnl.toFixed(4) },
            "TP2 alcanzado — cerrado 35%, SL movido a TP1",
          );
          continue;
        }

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

      const effectiveSlPct = parseFloat(bot.stopLossPercent);
      const slThreshold = tpLevel >= 2 ? -tp1 : tpLevel >= 1 ? 0 : -effectiveSlPct;
      if (pctChange <= slThreshold) {
        const reason = tpLevel >= 2 ? `SL trailing en TP1 (${tp1}%)` : tpLevel >= 1 ? "SL breakeven post-TP1" : `Stop-loss: ${pctChange.toFixed(4)}%`;
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

  private async checkForSignals(botId: number, bot: Bot): Promise<void> {
    if (!this.signalProvider) return;

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
    if (bot.mode === "paper") {
      result = await openPaperTrade(bot, signal.side, signal.confidence, signal.signal, signal.takeProfitPct, signal.tp1Pct, signal.tp2Pct, signal.tp3Pct);
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
