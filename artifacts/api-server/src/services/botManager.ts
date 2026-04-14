import { eq, and } from "drizzle-orm";
import { db, botsTable, tradeLogsTable, type Bot } from "@workspace/db";
import { marketData } from "./marketData";
import { checkStopLoss, pauseBot } from "./riskManager";
import { closePaperTrade } from "./paperTrading";
import { closeLiveTrade } from "./liveTrading";
import { logger } from "../lib/logger";

const MONITOR_INTERVAL_MS = 2000;

class BotManager {
  private monitorIntervals: Map<number, ReturnType<typeof setInterval>> = new Map();
  private runningBots: Map<number, Bot> = new Map();

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

    marketData.subscribe(bot.pair);

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
      marketData.unsubscribe(bot.pair);
      this.runningBots.delete(botId);
    }

    await db
      .update(botsTable)
      .set({ status: "stopped" })
      .where(eq(botsTable.id, botId));

    logger.info({ botId }, "Bot stopped");
    return { success: true };
  }

  private startMonitoring(botId: number): void {
    if (this.monitorIntervals.has(botId)) return;

    const interval = setInterval(async () => {
      try {
        await this.monitorOpenTrades(botId);
      } catch (err) {
        logger.error({ err, botId }, "Error monitoring trades");
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

  private async monitorOpenTrades(botId: number): Promise<void> {
    const bot = this.runningBots.get(botId);
    if (!bot) return;

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
