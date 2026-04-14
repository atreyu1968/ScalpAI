import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, botsTable, apiKeysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { botManager } from "../services/botManager";
import { killSwitch, killAllBots } from "../services/riskManager";
import { marketData } from "../services/marketData";
import { rateLimiter } from "../services/rateLimiter";
import {
  CreateBotBody,
  UpdateBotBody,
  GetBotParams,
  UpdateBotParams,
  DeleteBotParams,
  StartBotParams,
  StopBotParams,
  KillBotParams,
} from "@workspace/api-zod";

async function validateApiKeyOwnership(apiKeyId: number | undefined | null, userId: number): Promise<string | null> {
  if (!apiKeyId) return null;
  const [key] = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, apiKeyId), eq(apiKeysTable.userId, userId)));
  if (!key) return "API key not found or does not belong to you";
  return null;
}

const router: IRouter = Router();

function formatBot(bot: typeof botsTable.$inferSelect) {
  return {
    id: bot.id,
    name: bot.name,
    pair: bot.pair,
    mode: bot.mode,
    status: bot.status,
    leverage: bot.leverage,
    capitalAllocated: bot.capitalAllocated,
    aiConfidenceThreshold: bot.aiConfidenceThreshold,
    stopLossPercent: bot.stopLossPercent,
    maxDailyDrawdownPercent: bot.maxDailyDrawdownPercent,
    dailyPnl: bot.dailyPnl,
    apiKeyId: bot.apiKeyId ?? null,
    pausedUntil: bot.pausedUntil?.toISOString() ?? null,
    createdAt: bot.createdAt.toISOString(),
    updatedAt: bot.updatedAt.toISOString(),
  };
}

router.get("/bots", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const bots = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.userId, userId));

  res.json(bots.map(formatBot));
});

router.post("/bots", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;
  const data = parsed.data;

  const apiKeyError = await validateApiKeyOwnership(data.apiKeyId, userId);
  if (apiKeyError) {
    res.status(403).json({ error: apiKeyError });
    return;
  }

  const [created] = await db
    .insert(botsTable)
    .values({
      userId,
      name: data.name,
      pair: data.pair ?? "BTC/USDT",
      mode: (data.mode as "paper" | "live") ?? "paper",
      apiKeyId: data.apiKeyId,
      leverage: data.leverage ?? 1,
      capitalAllocated: data.capitalAllocated ?? "100",
      aiConfidenceThreshold: data.aiConfidenceThreshold ?? "85.00",
      stopLossPercent: data.stopLossPercent ?? "0.20",
      maxDailyDrawdownPercent: data.maxDailyDrawdownPercent ?? "5.00",
    })
    .returning();

  res.status(201).json(formatBot(created));
});

router.get("/bots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(formatBot(bot));
});

router.patch("/bots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.user!.userId;

  if (parsed.data.apiKeyId !== undefined) {
    const apiKeyError = await validateApiKeyOwnership(parsed.data.apiKeyId, userId);
    if (apiKeyError) {
      res.status(403).json({ error: apiKeyError });
      return;
    }
  }

  const updateData: Partial<{
    name: string;
    pair: string;
    mode: "paper" | "live";
    apiKeyId: number;
    leverage: number;
    capitalAllocated: string;
    aiConfidenceThreshold: string;
    stopLossPercent: string;
    maxDailyDrawdownPercent: string;
  }> = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.pair !== undefined) updateData.pair = parsed.data.pair;
  if (parsed.data.mode !== undefined) updateData.mode = parsed.data.mode as "paper" | "live";
  if (parsed.data.apiKeyId !== undefined) updateData.apiKeyId = parsed.data.apiKeyId;
  if (parsed.data.leverage !== undefined) updateData.leverage = parsed.data.leverage;
  if (parsed.data.capitalAllocated !== undefined) updateData.capitalAllocated = parsed.data.capitalAllocated;
  if (parsed.data.aiConfidenceThreshold !== undefined) updateData.aiConfidenceThreshold = parsed.data.aiConfidenceThreshold;
  if (parsed.data.stopLossPercent !== undefined) updateData.stopLossPercent = parsed.data.stopLossPercent;
  if (parsed.data.maxDailyDrawdownPercent !== undefined) updateData.maxDailyDrawdownPercent = parsed.data.maxDailyDrawdownPercent;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(botsTable)
    .set(updateData)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(formatBot(updated));
});

router.delete("/bots/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;

  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  if (botManager.isRunning(params.data.id)) {
    await botManager.stopBot(params.data.id);
  }

  await db
    .delete(botsTable)
    .where(eq(botsTable.id, params.data.id));

  res.sendStatus(204);
});

router.post("/bots/:id/start", requireAuth, async (req, res): Promise<void> => {
  const params = StartBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const result = await botManager.startBot(params.data.id);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true, message: `Bot '${bot.name}' started in ${bot.mode} mode` });
});

router.post("/bots/:id/stop", requireAuth, async (req, res): Promise<void> => {
  const params = StopBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  await botManager.stopBot(params.data.id);
  res.json({ success: true, message: `Bot '${bot.name}' stopped` });
});

router.post("/bots/:id/kill", requireAuth, async (req, res): Promise<void> => {
  const params = KillBotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  await botManager.killBot(params.data.id);
  await killSwitch(params.data.id, userId);

  res.json({ success: true, message: "Kill switch activated — all positions closed and bot stopped" });
});

router.post("/bots/kill-all", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;

  const userBots = await db
    .select()
    .from(botsTable)
    .where(eq(botsTable.userId, userId));

  for (const bot of userBots) {
    await botManager.killBot(bot.id);
  }

  const stopped = await killAllBots(userId);
  res.json({ stopped });
});

router.get("/market/status", requireAuth, async (req, res): Promise<void> => {
  const keys = marketData.getActiveSymbols();

  const connections = keys.map((key) => {
    const isFutures = key.startsWith("f:");
    const rawSymbol = isFutures ? key.slice(2) : key;
    return {
      symbol: rawSymbol,
      futures: isFutures,
      connected: marketData.isConnected(rawSymbol, isFutures),
      hasOrderBook: marketData.getOrderBook(key) !== undefined,
    };
  });

  res.json({ activeSymbols: keys, connections });
});

router.get("/rate-limit/status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId.toString();
  const status = rateLimiter.getStatus(userId);
  res.json(status);
});

router.get("/market/orderbook/:symbol", requireAuth, async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol).toLowerCase();
  const ob = marketData.getOrderBook(symbol) || marketData.getOrderBook(`f:${symbol}`);
  if (!ob) {
    res.json({ bids: [], asks: [], lastUpdateId: 0, timestamp: Date.now() });
    return;
  }
  res.json({
    bids: ob.bids.slice(0, 15).map(l => ({ price: l.price, quantity: l.quantity })),
    asks: ob.asks.slice(0, 15).map(l => ({ price: l.price, quantity: l.quantity })),
    lastUpdateId: ob.lastUpdateId,
    timestamp: ob.timestamp,
  });
});

router.get("/market/trades/:symbol", requireAuth, async (req, res): Promise<void> => {
  const symbol = String(req.params.symbol).toLowerCase();
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
  const trades = marketData.getRecentTrades(symbol, limit);
  if (trades.length === 0) {
    const futuresTrades = marketData.getRecentTrades(`f:${symbol}`, limit);
    res.json(futuresTrades.map(t => ({ price: t.price, quantity: t.quantity, time: t.time, isBuyerMaker: t.isBuyerMaker })));
    return;
  }
  res.json(trades.map(t => ({ price: t.price, quantity: t.quantity, time: t.time, isBuyerMaker: t.isBuyerMaker })));
});

export default router;
