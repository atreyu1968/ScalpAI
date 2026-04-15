import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, tradeLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import {
  ListTradesQueryParams,
  GetTradeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function formatTrade(trade: typeof tradeLogsTable.$inferSelect) {
  return {
    id: trade.id,
    botId: trade.botId,
    pair: trade.pair,
    side: trade.side,
    mode: trade.mode,
    status: trade.status,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice ?? null,
    quantity: trade.quantity,
    pnl: trade.pnl ?? null,
    commission: trade.commission ?? null,
    slippage: trade.slippage ?? null,
    aiConfidence: trade.aiConfidence ?? null,
    aiSignal: trade.aiSignal ?? null,
    aiTakeProfitPct: trade.aiTakeProfitPct ?? null,
    aiTp1Pct: trade.aiTp1Pct ?? null,
    aiTp2Pct: trade.aiTp2Pct ?? null,
    aiTp3Pct: trade.aiTp3Pct ?? null,
    tpLevelReached: trade.tpLevelReached,
    remainingQuantity: trade.remainingQuantity ?? null,
    realizedPnl: trade.realizedPnl ?? null,
    openedAt: trade.openedAt.toISOString(),
    closedAt: trade.closedAt?.toISOString() ?? null,
  };
}

router.get("/trades", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListTradesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const params = parsed.data;

  const userId = req.user!.userId;
  const conditions = [eq(tradeLogsTable.userId, userId)];

  if (params.botId) {
    conditions.push(eq(tradeLogsTable.botId, params.botId));
  }
  if (params.status) {
    conditions.push(eq(tradeLogsTable.status, params.status as "open" | "closed" | "cancelled"));
  }

  const trades = await db
    .select()
    .from(tradeLogsTable)
    .where(and(...conditions))
    .orderBy(desc(tradeLogsTable.createdAt))
    .limit(params.limit ?? 50)
    .offset(params.offset ?? 0);

  res.json(trades.map(formatTrade));
});

router.get("/trades/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTradeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.user!.userId;
  const [trade] = await db
    .select()
    .from(tradeLogsTable)
    .where(and(eq(tradeLogsTable.id, params.data.id), eq(tradeLogsTable.userId, userId)));

  if (!trade) {
    res.status(404).json({ error: "Trade not found" });
    return;
  }

  res.json(formatTrade(trade));
});

export default router;
