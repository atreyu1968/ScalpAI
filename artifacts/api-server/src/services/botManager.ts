import { eq, and } from "drizzle-orm";
import { db, botsTable, tradeLogsTable, type Bot } from "@workspace/db";
import { marketData } from "./marketData";
import { checkStopLoss, checkDailyDrawdown, pauseBot } from "./riskManager";
import { openPaperTrade, closePaperTrade } from "./paperTrading";
import { openLiveTrade, closeLiveTrade } from "./liveTrading";
import { logger } from "../lib/logger";

const MONITOR_INTERVAL_MS = 2000;

export type TradeSignal = {
  side: "long" | "short";
  confidence?: number;
  signal?: string;
};

export type SignalProvider = (bot: Bot) => Promise<TradeSignal | null>;

class BotManager {
  private monitorIntervals: Map<number, ReturnType<typeof setInterval>> = new Map();
  private runningBots: Map<number, Bot> = new Map();
  private signalProvider: SignalProvider | null = null;

  setSignalProvider(provider: SignalProvider): void {
    this.signalProvider = provider;
  }

  async startBot(botId: number): Promise<{ success: boolean; error?: string }> {
    const [bot] = await db
      .select()
      .from(botsTable)
      .where(eq(botsTable.id, botId));

    if (!bot) return { success: false, error: "Bot not found" };

    if (bot.status === "running") return { success: false, error: "Bot is already running" };

    if (bot.pausedUntil && bot.pausedUntil > new Date()) {
      return { success: false, error: `Bot is paused until ${bot.pausedUntil.toISOString()}` };
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

    await db
      .update(botsTable)
      .set({ status: "running", pausedUntil: null })
      .where(eq(botsTable.id, botId));

    const updatedBot = { ...bot, status: "running" as const, pausedUntil: null };
    this.runningBots.set(botId, updatedBot);
    this.startMonitoring(botId);

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

    logger.info({ botId }, "Bot stopped");
    return { success: true };
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
    logger.warn({ botId, reason }, "Bot paused at runtime");
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
          marketData.unsubscribe(runBot.pair);
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
    await this.checkForSignals(botId, postTradeBot);
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
      const ob = marketData.getOrderBook(symbol);
      if (!ob || ob.bids.length === 0 || ob.asks.length === 0) continue;

      const currentPrice = trade.side === "long" ? ob.bids[0].price : ob.asks[0].price;
      const entryPrice = parseFloat(trade.entryPrice);

      const stopLossCheck = checkStopLoss(bot, entryPrice, currentPrice, trade.side);
      if (!stopLossCheck.allowed) {
        logger.warn({ botId, tradeId: trade.id, reason: stopLossCheck.reason }, "Stop-loss triggered, closing trade");

        if (trade.mode === "paper") {
          await closePaperTrade(trade.id, bot);
        } else {
          await closeLiveTrade(trade.id, bot, true);
        }
      }
    }
  }

  private async checkForSignals(botId: number, bot: Bot): Promise<void> {
    if (!this.signalProvider) return;

    const openTrades = await db
      .select()
      .from(tradeLogsTable)
      .where(
        and(
          eq(tradeLogsTable.botId, botId),
          eq(tradeLogsTable.status, "open"),
        ),
      );

    if (openTrades.length > 0) return;

    const signal = await this.signalProvider(bot);
    if (!signal) return;

    const threshold = parseFloat(bot.aiConfidenceThreshold);
    if (signal.confidence !== undefined && signal.confidence < threshold) {
      logger.debug({ botId, confidence: signal.confidence, threshold }, "Signal below confidence threshold");
      return;
    }

    logger.info({ botId, signal }, "Executing trade from signal");

    if (bot.mode === "paper") {
      await openPaperTrade(bot, signal.side, signal.confidence, signal.signal);
    } else {
      await openLiveTrade(bot, signal.side, signal.confidence, signal.signal);
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
