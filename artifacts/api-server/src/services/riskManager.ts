import { eq } from "drizzle-orm";
import { db, botsTable, type Bot } from "@workspace/db";
import { logger } from "../lib/logger";

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkStopLoss(bot: Bot, entryPrice: number, currentPrice: number, side: "long" | "short"): RiskCheckResult {
  const stopLossPct = parseFloat(bot.stopLossPercent);
  let pctChange: number;

  if (side === "long") {
    pctChange = ((currentPrice - entryPrice) / entryPrice) * 100;
  } else {
    pctChange = ((entryPrice - currentPrice) / entryPrice) * 100;
  }

  if (pctChange <= -stopLossPct) {
    return { allowed: false, reason: `Stop-loss triggered: ${pctChange.toFixed(4)}% (limit: -${stopLossPct}%)` };
  }

  return { allowed: true };
}

export function checkDailyDrawdown(bot: Bot, additionalLoss: number = 0): RiskCheckResult {
  const maxDrawdownPct = parseFloat(bot.maxDailyDrawdownPercent);
  const capital = parseFloat(bot.capitalAllocated);
  const dailyPnl = parseFloat(bot.dailyPnl) + additionalLoss;
  const drawdownPct = (Math.abs(Math.min(0, dailyPnl)) / capital) * 100;

  if (drawdownPct >= maxDrawdownPct) {
    return { allowed: false, reason: `Daily drawdown limit reached: ${drawdownPct.toFixed(2)}% (limit: ${maxDrawdownPct}%)` };
  }

  return { allowed: true };
}

export async function pauseBot(botId: number, reason: string): Promise<void> {
  const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(botsTable)
    .set({ status: "paused", pausedUntil: pauseUntil })
    .where(eq(botsTable.id, botId));

  logger.warn({ botId, reason, pauseUntil }, "Bot paused by risk manager");
}

export async function killSwitch(botId: number, userId: number): Promise<boolean> {
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, botId));

  if (!bot || bot.userId !== userId) return false;

  await db
    .update(botsTable)
    .set({ status: "stopped" })
    .where(eq(botsTable.id, botId));

  logger.warn({ botId, userId }, "Kill switch activated — bot stopped immediately");
  return true;
}

export async function killAllBots(userId: number): Promise<number> {
  const result = await db
    .update(botsTable)
    .set({ status: "stopped" })
    .where(eq(botsTable.userId, userId))
    .returning();

  logger.warn({ userId, count: result.length }, "Kill-all activated — all bots stopped");
  return result.length;
}

export async function updateDailyPnl(botId: number, pnlDelta: number): Promise<void> {
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.id, botId));

  if (!bot) return;

  const newPnl = parseFloat(bot.dailyPnl) + pnlDelta;

  await db
    .update(botsTable)
    .set({ dailyPnl: newPnl.toString() })
    .where(eq(botsTable.id, botId));

  const drawdownCheck = checkDailyDrawdown({ ...bot, dailyPnl: newPnl.toString() });
  if (!drawdownCheck.allowed) {
    await pauseBot(botId, drawdownCheck.reason!);
  }
}
