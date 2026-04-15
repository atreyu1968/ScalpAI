import { eq, and } from "drizzle-orm";
import { db, tradeLogsTable, apiKeysTable, type Bot } from "@workspace/db";
import { decrypt } from "../lib/crypto";
import { rateLimiter } from "./rateLimiter";
import { checkDailyDrawdown, updateDailyPnl } from "./riskManager";
import { logger } from "../lib/logger";

interface ExchangeOrder {
  id: string;
  status: string;
  filled?: number;
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
  fetchOrder(orderId: string, pair: string): Promise<ExchangeOrder>;
  cancelOrder(orderId: string, pair: string): Promise<void>;
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

  const useFutures = bot.leverage > 1;
  const ccxt = await import("ccxt");
  const exchange = new ccxt.default.binance({
    apiKey: decrypt(apiKeyRow.encryptedApiKey),
    secret: decrypt(apiKeyRow.encryptedApiSecret),
    enableRateLimit: true,
    options: { defaultType: useFutures ? "future" : "spot" },
  });

  if (useFutures) {
    await exchange.setLeverage(bot.leverage, bot.pair);
  }

  return exchange as unknown as ExchangeClient;
}

export async function openLiveTrade(
  bot: Bot,
  side: "long" | "short",
  aiConfidence?: number,
  aiSignal?: string,
  aiTakeProfitPct?: number,
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
      { timeInForce: "IOC" },
    );
    rateLimiter.recordWeight(userIdStr, 1);

    let filledOrder = order;
    if (order.status !== "closed" && order.status !== "canceled") {
      await new Promise((r) => setTimeout(r, 2000));
      filledOrder = await exchange.fetchOrder(order.id, bot.pair);
      rateLimiter.recordWeight(userIdStr, 1);
    }

    if (filledOrder.status === "canceled" || !filledOrder.filled || filledOrder.filled === 0) {
      logger.warn({ botId: bot.id, orderId: order.id }, "Order not filled, cancelling");
      try {
        if (filledOrder.status === "open") {
          await exchange.cancelOrder(order.id, bot.pair);
          rateLimiter.recordWeight(userIdStr, 1);
        }
      } catch {}
      return { error: "Order was not filled" };
    }

    const filledPrice = filledOrder.average || filledOrder.price || price;
    const filledQty = filledOrder.filled || quantity;
    const commission = (filledOrder.fee?.cost ?? filledQty * filledPrice * 0.001);

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
        quantity: filledQty.toFixed(8),
        commission: commission.toFixed(8),
        slippage: Math.abs(filledPrice - price).toFixed(8),
        aiConfidence: aiConfidence?.toFixed(2),
        aiSignal,
        aiTakeProfitPct: aiTakeProfitPct?.toFixed(2),
        openedAt: new Date(),
      })
      .returning();

    logger.info({ botId: bot.id, tradeId: trade.id, orderId: order.id, side, filledPrice, filledQty }, "Live trade opened");
    return { tradeId: trade.id, entryPrice: filledPrice };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to place order";
    logger.error({ err, botId: bot.id }, "Failed to open live trade");
    return { error: message };
  }
}

async function finalizeClose(
  tradeId: number,
  bot: Bot,
  exitPrice: number,
  filledQty: number,
  order: ExchangeOrder,
): Promise<{ pnl: number }> {
  const [trade] = await db
    .select()
    .from(tradeLogsTable)
    .where(eq(tradeLogsTable.id, tradeId));

  const entryPrice = parseFloat(trade.entryPrice);
  const exitCommission = (order.fee?.cost ?? filledQty * exitPrice * 0.001);
  const entryCommission = parseFloat(trade.commission ?? "0");

  let pnl: number;
  if (trade.side === "long") {
    pnl = (exitPrice - entryPrice) * filledQty;
  } else {
    pnl = (entryPrice - exitPrice) * filledQty;
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

  logger.info({ botId: bot.id, tradeId, orderId: order.id, exitPrice, pnl }, "Live trade closed");
  return { pnl };
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

    let price: number | undefined;
    if (!emergency) {
      const ticker = await exchange.fetchTicker(bot.pair);
      rateLimiter.recordWeight(userIdStr, 1);
      price = ticker.last;
    }

    if (emergency) {
      const order = await exchange.createOrder(
        bot.pair,
        "market",
        closeSide,
        quantity,
      );
      rateLimiter.recordWeight(userIdStr, 1);

      let filledOrder = order;
      if (order.status !== "closed") {
        await new Promise((r) => setTimeout(r, 1000));
        filledOrder = await exchange.fetchOrder(order.id, bot.pair);
        rateLimiter.recordWeight(userIdStr, 1);
      }

      const exitPrice = filledOrder.average || filledOrder.price || 0;
      return finalizeClose(tradeId, bot, exitPrice, filledOrder.filled || quantity, filledOrder);
    }

    const order = await exchange.createOrder(
      bot.pair,
      "limit",
      closeSide,
      quantity,
      price,
      { timeInForce: "IOC" },
    );
    rateLimiter.recordWeight(userIdStr, 1);

    let filledOrder = order;
    if (order.status !== "closed" && order.status !== "canceled") {
      await new Promise((r) => setTimeout(r, 2000));
      filledOrder = await exchange.fetchOrder(order.id, bot.pair);
      rateLimiter.recordWeight(userIdStr, 1);
    }

    if (filledOrder.status === "canceled" || !filledOrder.filled || filledOrder.filled === 0) {
      logger.warn({ botId: bot.id, tradeId, orderId: order.id }, "Close order not filled, retrying as market order");
      try {
        if (filledOrder.status === "open") {
          await exchange.cancelOrder(order.id, bot.pair);
          rateLimiter.recordWeight(userIdStr, 1);
        }
      } catch {}

      const marketOrder = await exchange.createOrder(
        bot.pair,
        "market",
        closeSide,
        quantity,
      );
      rateLimiter.recordWeight(userIdStr, 1);

      let marketFilled = marketOrder;
      if (marketOrder.status !== "closed") {
        await new Promise((r) => setTimeout(r, 1000));
        marketFilled = await exchange.fetchOrder(marketOrder.id, bot.pair);
        rateLimiter.recordWeight(userIdStr, 1);
      }

      if (!marketFilled.filled || marketFilled.filled === 0) {
        logger.error({ botId: bot.id, tradeId }, "Market close order also unfilled — trade remains open");
        return { error: "Failed to close position — both limit and market orders unfilled" };
      }

      const exitPrice = marketFilled.average || marketFilled.price || 0;
      return finalizeClose(tradeId, bot, exitPrice, marketFilled.filled || quantity, marketFilled);
    }

    const exitPrice = filledOrder.average || filledOrder.price || price || 0;
    return finalizeClose(tradeId, bot, exitPrice, filledOrder.filled || quantity, filledOrder);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to close order";
    logger.error({ err, botId: bot.id, tradeId }, "Failed to close live trade");
    return { error: message };
  }
}
