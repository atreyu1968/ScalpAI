import { eq } from "drizzle-orm";
import { db, botsTable, type Bot } from "@workspace/db";
import { logger } from "../lib/logger";

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
}

function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getMondayUtcDateString(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d.toISOString().slice(0, 10);
}

function getNextMondayDate(date: Date = new Date()): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = d.getUTCDay();
  const daysUntilNextMonday = ((1 - dayOfWeek + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilNextMonday);
  return d;
}

function getDailyPnlForToday(bot: Bot): number {
  const today = getUtcDateString();
  if (bot.dailyPnlDate !== today) {
    return 0;
  }
  return parseFloat(bot.dailyPnl);
}

function getWeeklyPnlForCurrentWeek(bot: Bot): number {
  const monday = getMondayUtcDateString();
  if (bot.weeklyPnlWeekStart !== monday) {
    return 0;
  }
  return parseFloat(bot.weeklyPnl);
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
  const dailyPnl = getDailyPnlForToday(bot) + additionalLoss;
  const drawdownPct = (Math.abs(Math.min(0, dailyPnl)) / capital) * 100;

  if (drawdownPct >= maxDrawdownPct) {
    return { allowed: false, reason: `Daily drawdown limit reached: ${drawdownPct.toFixed(2)}% (limit: ${maxDrawdownPct}%)` };
  }

  return { allowed: true };
}

export function checkWeeklyDrawdown(bot: Bot, additionalLoss: number = 0): RiskCheckResult {
  const maxDrawdownPct = parseFloat(bot.maxWeeklyDrawdownPercent ?? "10.00");
  if (!Number.isFinite(maxDrawdownPct) || maxDrawdownPct <= 0) {
    return { allowed: true };
  }
  const capital = parseFloat(bot.capitalAllocated);
  const weeklyPnl = getWeeklyPnlForCurrentWeek(bot) + additionalLoss;
  const drawdownPct = (Math.abs(Math.min(0, weeklyPnl)) / capital) * 100;

  if (drawdownPct >= maxDrawdownPct) {
    return {
      allowed: false,
      reason: `Weekly drawdown limit reached: ${drawdownPct.toFixed(2)}% (limit: ${maxDrawdownPct}%) — paused until next Monday`,
    };
  }

  return { allowed: true };
}

export async function pauseBot(botId: number, reason: string, until?: Date): Promise<void> {
  const pauseUntil = until ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db
    .update(botsTable)
    .set({ status: "paused", pausedUntil: pauseUntil, pauseReason: reason })
    .where(eq(botsTable.id, botId));

  logger.warn({ botId, reason, pauseUntil: pauseUntil.toISOString() }, "Bot paused by risk manager");
}

export async function pauseBotUntilNextMonday(botId: number, reason: string): Promise<void> {
  const until = getNextMondayDate();
  await pauseBot(botId, reason, until);
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

  const today = getUtcDateString();
  const monday = getMondayUtcDateString();

  let currentDaily = 0;
  if (bot.dailyPnlDate === today) {
    currentDaily = parseFloat(bot.dailyPnl);
  }
  const newDaily = currentDaily + pnlDelta;

  let currentWeekly = 0;
  if (bot.weeklyPnlWeekStart === monday) {
    currentWeekly = parseFloat(bot.weeklyPnl);
  }
  const newWeekly = currentWeekly + pnlDelta;

  await db
    .update(botsTable)
    .set({
      dailyPnl: newDaily.toString(),
      dailyPnlDate: today,
      weeklyPnl: newWeekly.toString(),
      weeklyPnlWeekStart: monday,
    })
    .where(eq(botsTable.id, botId));

  const updatedBot: Bot = {
    ...bot,
    dailyPnl: newDaily.toString(),
    dailyPnlDate: today,
    weeklyPnl: newWeekly.toString(),
    weeklyPnlWeekStart: monday,
  };

  const dailyCheck = checkDailyDrawdown(updatedBot);
  if (!dailyCheck.allowed) {
    await pauseBot(botId, dailyCheck.reason!);
    return;
  }

  const weeklyCheck = checkWeeklyDrawdown(updatedBot);
  if (!weeklyCheck.allowed) {
    await pauseBotUntilNextMonday(botId, weeklyCheck.reason!);
  }
}
