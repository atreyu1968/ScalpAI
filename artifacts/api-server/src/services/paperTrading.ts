import { eq } from "drizzle-orm";
import { db, tradeLogsTable, type Bot } from "@workspace/db";
import { marketData } from "./marketData";
import { checkDailyDrawdown, updateDailyPnl } from "./riskManager";
import { logger } from "../lib/logger";

const TAKER_FEE = 0.001;
const MAKER_FEE = 0.0005;
const SLIPPAGE_BPS = 5;

function marketDataKey(bot: Bot): string {
  const symbol = bot.pair.replace("/", "").toLowerCase();
  const useFutures = bot.mode === "live" && bot.leverage > 1;
  return useFutures ? `f:${symbol}` : symbol;
}

function applySlippage(price: number, side: "long" | "short"): number {
  const slippageMultiplier = SLIPPAGE_BPS / 10000;
  return side === "long"
    ? price * (1 + slippageMultiplier)
    : price * (1 - slippageMultiplier);
}

function determineFee(side: "long" | "short", orderBook: import("./marketData").OrderBook, quantity: number, price: number): { fee: number; isMaker: boolean } {
  const relevantSide = side === "long" ? orderBook.asks : orderBook.bids;
  if (relevantSide.length === 0) {
    return { fee: quantity * price * TAKER_FEE, isMaker: false };
  }

  const bestPrice = relevantSide[0].price;
  const bestQty = relevantSide[0].quantity;
  const isMaker = quantity <= bestQty * 0.1;
  const feeRate = isMaker ? MAKER_FEE : TAKER_FEE;
  return { fee: quantity * price * feeRate, isMaker };
}

export async function openPaperTrade(
  bot: Bot,
  side: "long" | "short",
  aiConfidence?: number,
  aiSignal?: string,
  aiTakeProfitPct?: number,
  aiTp1Pct?: number,
  aiTp2Pct?: number,
  aiTp3Pct?: number,
): Promise<{ tradeId: number; entryPrice: number } | { error: string }> {
  const obKey = marketDataKey(bot);
  const orderBook = marketData.getOrderBook(obKey);

  if (!orderBook || orderBook.asks.length === 0 || orderBook.bids.length === 0) {
    return { error: "No order book data available" };
  }

  const rawPrice = side === "long" ? orderBook.asks[0].price : orderBook.bids[0].price;
  const entryPrice = applySlippage(rawPrice, side);
  const capital = parseFloat(bot.capitalAllocated);
  const quantity = (capital * bot.leverage) / entryPrice;
  const { fee: commission } = determineFee(side, orderBook, quantity, entryPrice);

  const drawdownCheck = checkDailyDrawdown(bot);
  if (!drawdownCheck.allowed) {
    return { error: drawdownCheck.reason! };
  }

  const [trade] = await db
    .insert(tradeLogsTable)
    .values({
      userId: bot.userId,
      botId: bot.id,
      pair: bot.pair,
      side,
      mode: "paper",
      status: "open",
      entryPrice: entryPrice.toFixed(8),
      quantity: quantity.toFixed(8),
      commission: commission.toFixed(8),
      slippage: (Math.abs(entryPrice - rawPrice)).toFixed(8),
      aiConfidence: aiConfidence?.toFixed(2),
      aiSignal,
      aiTakeProfitPct: aiTakeProfitPct?.toFixed(2),
      aiTp1Pct: aiTp1Pct?.toFixed(2),
      aiTp2Pct: aiTp2Pct?.toFixed(2),
      aiTp3Pct: aiTp3Pct?.toFixed(2),
      remainingQuantity: quantity.toFixed(8),
      openedAt: new Date(),
    })
    .returning();

  logger.info({ botId: bot.id, tradeId: trade.id, side, entryPrice, quantity }, "Paper trade opened");
  return { tradeId: trade.id, entryPrice };
}

export async function closePaperTrade(
  tradeId: number,
  bot: Bot,
): Promise<{ pnl: number } | { error: string }> {
  const [trade] = await db
    .select()
    .from(tradeLogsTable)
    .where(eq(tradeLogsTable.id, tradeId));

  if (!trade || trade.status !== "open") {
    return { error: "Trade not found or already closed" };
  }

  const obKey = marketDataKey(bot);
  const orderBook = marketData.getOrderBook(obKey);

  if (!orderBook || orderBook.asks.length === 0 || orderBook.bids.length === 0) {
    return { error: "No order book data available" };
  }

  const rawExitPrice = trade.side === "long" ? orderBook.bids[0].price : orderBook.asks[0].price;
  const exitPrice = applySlippage(rawExitPrice, trade.side === "long" ? "short" : "long");
  const remainingQty = trade.remainingQuantity ? parseFloat(trade.remainingQuantity) : parseFloat(trade.quantity);
  const entryPrice = parseFloat(trade.entryPrice);
  const closeSide = trade.side === "long" ? "short" : "long";
  const { fee: exitCommission } = determineFee(closeSide as "long" | "short", orderBook, remainingQty, exitPrice);
  const entryCommission = parseFloat(trade.commission ?? "0");
  const realizedPnl = parseFloat(trade.realizedPnl || "0");

  let finalPnl: number;
  if (trade.side === "long") {
    finalPnl = (exitPrice - entryPrice) * remainingQty;
  } else {
    finalPnl = (entryPrice - exitPrice) * remainingQty;
  }

  const pnl = realizedPnl + finalPnl - (entryCommission + exitCommission);

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

  logger.info({ botId: bot.id, tradeId, exitPrice, pnl }, "Paper trade closed");
  return { pnl };
}
