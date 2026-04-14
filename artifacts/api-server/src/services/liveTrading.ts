import { eq, and } from "drizzle-orm";
import { db, tradeLogsTable, apiKeysTable, type Bot } from "@workspace/db";
import { decrypt } from "../lib/crypto";
import { rateLimiter } from "./rateLimiter";
import { checkDailyDrawdown, updateDailyPnl } from "./riskManager";
import { logger } from "../lib/logger";

interface ExchangeOrder {
  id: string;
  average?: number;
  price?: number;
  fee?: { cost?: number };
}

interface ExchangeClient {
  setLeverage(leverage: number, pair: string): Promise<void>;
  fetchTicker(pair: string): Promise<{ last: number }>;
  createOrder(
    pair: string,
    type: string,
    side: string,
    quantity: number,
    price?: number,
    params?: Record<string, string>,
  ): Promise<ExchangeOrder>;
}

async function getBinanceClient(bot: Bot): Promise<ExchangeClient> {
  if (!bot.apiKeyId) {
    throw new Error("No API key configured for this bot");
  }

  const [apiKeyRow] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, bot.apiKeyId), eq(apiKeysTable.userId, bot.userId)));

  if (!apiKeyRow) {
    throw new Error("API key not found or does not belong to bot owner");
  }

  const ccxt = await import("ccxt");
  const exchange = new ccxt.default.binance({
    apiKey: decrypt(apiKeyRow.encryptedApiKey),
    secret: decrypt(apiKeyRow.encryptedApiSecret),
    enableRateLimit: true,
    options: { defaultType: "future" },
  });

  return exchange as unknown as ExchangeClient;
}

export async function openLiveTrade(
  bot: Bot,
  side: "long" | "short",
  aiConfidence?: number,
  aiSignal?: string,
): Promise<{ tradeId: number; entryPrice: number } | { error: string }> {
  const userIdStr = bot.userId.toString();

  if (!rateLimiter.canProceed(userIdStr, 5)) {
    return { error: "API rate limit approaching — trade deferred" };
  }

  const drawdownCheck = checkDailyDrawdown(bot);
  if (!drawdownCheck.allowed) {
    return { error: drawdownCheck.reason! };
  }

  try {
    const exchange = await getBinanceClient(bot);
    const capital = parseFloat(bot.capitalAllocated);

    if (bot.leverage > 1) {
      await exchange.setLeverage(bot.leverage, bot.pair);
      rateLimiter.recordWeight(userIdStr, 1);
    }

    const ticker = await exchange.fetchTicker(bot.pair);
    rateLimiter.recordWeight(userIdStr, 1);

    const price = ticker.last;
    if (!price) return { error: "Could not fetch current price" };

    const quantity = (capital * bot.leverage) / price;
    const orderSide = side === "long" ? "buy" : "sell";

    const order = await exchange.createOrder(
      bot.pair,
      "limit",
      orderSide,
      quantity,
      price,
      { timeInForce: "GTC" },
    );
    rateLimiter.recordWeight(userIdStr, 1);

    const filledPrice = order.average || order.price || price;
    const commission = (order.fee?.cost ?? quantity * filledPrice * 0.001);

    const [trade] = await db
      .insert(tradeLogsTable)
      .values({
        userId: bot.userId,
        botId: bot.id,
        pair: bot.pair,
        side,
        mode: "live",
        status: "open",
        entryPrice: filledPrice.toFixed(8),
        quantity: quantity.toFixed(8),
        commission: commission.toFixed(8),
        slippage: Math.abs(filledPrice - price).toFixed(8),
        aiConfidence: aiConfidence?.toFixed(2),
        aiSignal,
        openedAt: new Date(),
      })
      .returning();

    logger.info({ botId: bot.id, tradeId: trade.id, orderId: order.id, side, filledPrice }, "Live trade opened");
    return { tradeId: trade.id, entryPrice: filledPrice };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to place order";
    logger.error({ err, botId: bot.id }, "Failed to open live trade");
    return { error: message };
  }
}

export async function closeLiveTrade(
  tradeId: number,
  bot: Bot,
  emergency: boolean = false,
): Promise<{ pnl: number } | { error: string }> {
  const [trade] = await db
    .select()
    .from(tradeLogsTable)
    .where(eq(tradeLogsTable.id, tradeId));

  if (!trade || trade.status !== "open") {
    return { error: "Trade not found or already closed" };
  }

  const userIdStr = bot.userId.toString();
  if (!rateLimiter.canProceed(userIdStr, 5)) {
    if (!emergency) {
      return { error: "API rate limit approaching — close deferred" };
    }
  }

  try {
    const exchange = await getBinanceClient(bot);
    const quantity = parseFloat(trade.quantity);
    const closeSide = trade.side === "long" ? "sell" : "buy";
    const orderType = emergency ? "market" : "limit";

    let price: number | undefined;
    if (!emergency) {
      const ticker = await exchange.fetchTicker(bot.pair);
      rateLimiter.recordWeight(userIdStr, 1);
      price = ticker.last;
    }

    const order = await exchange.createOrder(
      bot.pair,
      orderType,
      closeSide,
      quantity,
      orderType === "limit" ? price : undefined,
    );
    rateLimiter.recordWeight(userIdStr, 1);

    const exitPrice = order.average || order.price || price || 0;
    const entryPrice = parseFloat(trade.entryPrice);
    const exitCommission = (order.fee?.cost ?? quantity * exitPrice * 0.001);
    const entryCommission = parseFloat(trade.commission ?? "0");

    let pnl: number;
    if (trade.side === "long") {
      pnl = (exitPrice - entryPrice) * quantity;
    } else {
      pnl = (entryPrice - exitPrice) * quantity;
    }
    pnl -= (entryCommission + exitCommission);

    await db
      .update(tradeLogsTable)
      .set({
        exitPrice: exitPrice.toFixed(8),
        pnl: pnl.toFixed(8),
        commission: (entryCommission + exitCommission).toFixed(8),
        status: "closed",
        closedAt: new Date(),
      })
      .where(eq(tradeLogsTable.id, tradeId));

    await updateDailyPnl(bot.id, pnl);

    logger.info({ botId: bot.id, tradeId, orderId: order.id, exitPrice, pnl, emergency }, "Live trade closed");
    return { pnl };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to close order";
    logger.error({ err, botId: bot.id, tradeId }, "Failed to close live trade");
    return { error: message };
  }
}
