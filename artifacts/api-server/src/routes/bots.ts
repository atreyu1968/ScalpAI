import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, botsTable, apiKeysTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { botManager } from "../services/botManager";
import { killSwitch, killAllBots } from "../services/riskManager";
import { marketData } from "../services/marketData";
import { rateLimiter } from "../services/rateLimiter";
import { getPendingOrder, getLastDecision } from "../services/trendPullback";
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

const TREND_PULLBACK_PAIRS = new Set(["BTC/USDT", "ETH/USDT"]);

function formatBot(bot: typeof botsTable.$inferSelect) {
  return {
    id: bot.id,
    name: bot.name,
    pair: bot.pair,
    mode: bot.mode,
    marketType: bot.marketType,
    status: bot.status,
    leverage: bot.leverage,
    operationalLeverage: bot.operationalLeverage,
    capitalAllocated: bot.capitalAllocated,
    aiConfidenceThreshold: bot.aiConfidenceThreshold,
    stopLossPercent: bot.stopLossPercent,
    maxDailyDrawdownPercent: bot.maxDailyDrawdownPercent,
    maxWeeklyDrawdownPercent: bot.maxWeeklyDrawdownPercent,
    dailyPnl: bot.dailyPnl,
    weeklyPnl: bot.weeklyPnl,
    weeklyPnlWeekStart: bot.weeklyPnlWeekStart ?? null,
    apiKeyId: bot.apiKeyId ?? null,
    pausedUntil: bot.pausedUntil?.toISOString() ?? null,
    strategy: bot.strategy,
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

  const strategy = (data.strategy as "ai" | "trend_pullback") ?? "trend_pullback";

  let pair = data.pair ?? (strategy === "trend_pullback" ? "BTC/USDT" : "BTC/USDT");
  let mode: "paper" | "live" = (data.mode as "paper" | "live") ?? "paper";
  let marketType: "spot" | "futures" = (data.marketType as "spot" | "futures") ?? "spot";

  if (strategy === "trend_pullback") {
    if (!TREND_PULLBACK_PAIRS.has(pair)) {
      res.status(400).json({ error: "La estrategia Trend-Pullback solo admite BTC/USDT o ETH/USDT" });
      return;
    }
    if (mode !== "paper") {
      res.status(400).json({ error: "La estrategia Trend-Pullback solo admite modo paper" });
      return;
    }
    if (marketType !== "spot") {
      res.status(400).json({ error: "La estrategia Trend-Pullback solo admite mercado spot" });
      return;
    }
  }

  const [created] = await db
    .insert(botsTable)
    .values({
      userId,
      name: data.name,
      pair,
      mode,
      marketType,
      apiKeyId: data.apiKeyId,
      leverage: data.leverage ?? 1,
      operationalLeverage: data.operationalLeverage ?? data.leverage ?? 1,
      capitalAllocated: data.capitalAllocated ?? "100",
      aiConfidenceThreshold: data.aiConfidenceThreshold ?? "85.00",
      stopLossPercent: data.stopLossPercent ?? "0.20",
      maxDailyDrawdownPercent: data.maxDailyDrawdownPercent ?? "5.00",
      maxWeeklyDrawdownPercent: data.maxWeeklyDrawdownPercent ?? "10.00",
      strategy,
    })
    .returning();

  res.status(201).json(formatBot(created));
});

router.get("/bots/pending-orders", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const trendBots = await db
    .select({ id: botsTable.id })
    .from(botsTable)
    .where(and(eq(botsTable.userId, userId), eq(botsTable.strategy, "trend_pullback")));

  const now = Date.now();
  const result = trendBots.map(({ id }) => {
    const pending = getPendingOrder(id);
    if (pending) {
      const cleanSymbol = pending.symbol.replace("/", "").toLowerCase();
      const ob = marketData.getOrderBook(cleanSymbol);
      const bestAsk = ob && ob.asks.length > 0 ? ob.asks[0].price : null;
      const reason = bestAsk === null ? "limit_order_pending_no_orderbook" : "limit_order_pending";
      return {
        botId: id,
        status: "pending" as const,
        reason,
        limitPrice: pending.limitPrice,
        bestAsk,
        expiresAt: pending.expiresAt,
        ageMs: now - pending.createdAt,
        remainingMs: Math.max(0, pending.expiresAt - now),
        timeoutMs: pending.expiresAt - pending.createdAt,
      };
    }

    const last = getLastDecision(id);
    if (last && (last.reason === "limit_order_filled" || last.reason === "limit_order_expired")) {
      const details = last.details ?? {};
      const limitPrice = typeof details.limitPrice === "number" ? details.limitPrice : null;
      const ageMs = typeof details.ageMs === "number" ? details.ageMs : null;
      const timeoutMs = typeof details.timeoutMs === "number" ? details.timeoutMs : null;
      const fillAsk = typeof details.fillAsk === "number" ? details.fillAsk : null;
      return {
        botId: id,
        status: last.reason === "limit_order_filled" ? ("filled" as const) : ("expired" as const),
        reason: last.reason,
        limitPrice,
        bestAsk: fillAsk,
        expiresAt: null,
        ageMs,
        remainingMs: null,
        timeoutMs,
      };
    }

    return {
      botId: id,
      status: "none" as const,
      reason: last?.reason ?? null,
      limitPrice: null,
      bestAsk: null,
      expiresAt: null,
      ageMs: null,
      remainingMs: null,
      timeoutMs: null,
    };
  });

  res.json(result);
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
    marketType: "spot" | "futures";
    apiKeyId: number;
    leverage: number;
    operationalLeverage: number;
    capitalAllocated: string;
    aiConfidenceThreshold: string;
    stopLossPercent: string;
    maxDailyDrawdownPercent: string;
    maxWeeklyDrawdownPercent: string;
    strategy: "ai" | "trend_pullback";
  }> = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.pair !== undefined) updateData.pair = parsed.data.pair;
  if (parsed.data.mode !== undefined) updateData.mode = parsed.data.mode as "paper" | "live";
  if (parsed.data.marketType !== undefined) updateData.marketType = parsed.data.marketType as "spot" | "futures";
  if (parsed.data.apiKeyId !== undefined) updateData.apiKeyId = parsed.data.apiKeyId;
  if (parsed.data.leverage !== undefined) updateData.leverage = parsed.data.leverage;
  if (parsed.data.operationalLeverage !== undefined) updateData.operationalLeverage = parsed.data.operationalLeverage;
  if (parsed.data.capitalAllocated !== undefined) updateData.capitalAllocated = parsed.data.capitalAllocated;
  if (parsed.data.aiConfidenceThreshold !== undefined) updateData.aiConfidenceThreshold = parsed.data.aiConfidenceThreshold;
  if (parsed.data.stopLossPercent !== undefined) updateData.stopLossPercent = parsed.data.stopLossPercent;
  if (parsed.data.maxDailyDrawdownPercent !== undefined) updateData.maxDailyDrawdownPercent = parsed.data.maxDailyDrawdownPercent;
  if (parsed.data.maxWeeklyDrawdownPercent !== undefined) updateData.maxWeeklyDrawdownPercent = parsed.data.maxWeeklyDrawdownPercent;
  if (parsed.data.strategy !== undefined) updateData.strategy = parsed.data.strategy as "ai" | "trend_pullback";

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [existing] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  const effectiveStrategy = updateData.strategy ?? existing?.strategy ?? "trend_pullback";
  const effectivePair = updateData.pair ?? existing?.pair ?? "BTC/USDT";
  const effectiveMode = updateData.mode ?? existing?.mode ?? "paper";
  const effectiveMarket = updateData.marketType ?? existing?.marketType ?? "spot";

  if (effectiveStrategy === "trend_pullback") {
    if (!TREND_PULLBACK_PAIRS.has(effectivePair)) {
      res.status(400).json({ error: "La estrategia Trend-Pullback solo admite BTC/USDT o ETH/USDT" });
      return;
    }
    if (effectiveMode !== "paper") {
      res.status(400).json({ error: "La estrategia Trend-Pullback solo admite modo paper" });
      return;
    }
    if (effectiveMarket !== "spot") {
      res.status(400).json({ error: "La estrategia Trend-Pullback solo admite mercado spot" });
      return;
    }
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
    .where(and(eq(botsTable.id, params.data.id), eq(botsTable.userId, userId)));

  res.sendStatus(204);
});

router.get("/bots/:id/pending-order", requireAuth, async (req, res): Promise<void> => {
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

  const pending = getPendingOrder(params.data.id);
  if (pending) {
    const cleanSymbol = pending.symbol.replace("/", "").toLowerCase();
    const ob = marketData.getOrderBook(cleanSymbol);
    const bestAsk = ob && ob.asks.length > 0 ? ob.asks[0].price : null;
    const now = Date.now();
    const reason = bestAsk === null ? "limit_order_pending_no_orderbook" : "limit_order_pending";
    res.json({
      status: "pending",
      reason,
      limitPrice: pending.limitPrice,
      bestAsk,
      expiresAt: pending.expiresAt,
      ageMs: now - pending.createdAt,
      remainingMs: Math.max(0, pending.expiresAt - now),
      timeoutMs: pending.expiresAt - pending.createdAt,
    });
    return;
  }

  const last = getLastDecision(params.data.id);
  if (last && (last.reason === "limit_order_filled" || last.reason === "limit_order_expired")) {
    const details = last.details ?? {};
    const limitPrice = typeof details.limitPrice === "number" ? details.limitPrice : null;
    const ageMs = typeof details.ageMs === "number" ? details.ageMs : null;
    const timeoutMs = typeof details.timeoutMs === "number" ? details.timeoutMs : null;
    const fillAsk = typeof details.fillAsk === "number" ? details.fillAsk : null;
    res.json({
      status: last.reason === "limit_order_filled" ? "filled" : "expired",
      reason: last.reason,
      limitPrice,
      bestAsk: fillAsk,
      expiresAt: null,
      ageMs,
      remainingMs: null,
      timeoutMs,
    });
    return;
  }

  res.json({
    status: "none",
    reason: last?.reason ?? null,
    limitPrice: null,
    bestAsk: null,
    expiresAt: null,
    ageMs: null,
    remainingMs: null,
    timeoutMs: null,
  });
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
