import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Bot } from "@workspace/db";

type TradeRow = {
  id: number;
  userId: number;
  botId: number;
  pair: string;
  side: "long" | "short";
  mode: "paper" | "live";
  status: "open" | "closed" | "cancelled";
  entryPrice: string;
  exitPrice: string | null;
  quantity: string;
  pnl: string | null;
  commission: string | null;
  slippage: string | null;
  aiConfidence: string | null;
  aiSignal: string | null;
  aiTakeProfitPct: string | null;
  aiTp1Pct: string | null;
  aiTp2Pct: string | null;
  aiTp3Pct: string | null;
  dynamicStopPct: string | null;
  tpLevelReached: number;
  trailingStopPrice: string | null;
  remainingQuantity: string | null;
  realizedPnl: string | null;
  openedAt: Date;
  closedAt: Date | null;
};

const tradesById = new Map<number, TradeRow>();
let nextTradeId = 1;

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ __op: "eq", col, val }),
  and: (...args: any[]) => ({ __op: "and", args }),
  desc: (col: any) => ({ __op: "desc", col }),
}));

vi.mock("@workspace/db", () => {
  const idColumn = { __column: "id" };
  const botIdColumn = { __column: "bot_id" };
  const statusColumn = { __column: "status" };

  function extractEq(predicate: any, targetCol: any): unknown | null {
    if (!predicate) return null;
    if (predicate.__op === "eq" && predicate.col === targetCol) {
      return predicate.val;
    }
    if (predicate.__op === "and") {
      for (const part of predicate.args) {
        const v = extractEq(part, targetCol);
        if (v !== null) return v;
      }
    }
    return null;
  }
  function extractId(predicate: any): number | null {
    const v = extractEq(predicate, idColumn);
    return v === null ? null : Number(v);
  }

  const db = {
    insert: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async (predicate: any) => {
          // Honor botId + status filters from the production query so tests
          // can verify cross-bot isolation, not just open-status filtering.
          const botIdFilter = extractEq(predicate, botIdColumn);
          const statusFilter = extractEq(predicate, statusColumn);
          return Array.from(tradesById.values()).filter((t) => {
            if (botIdFilter !== null && t.botId !== Number(botIdFilter)) return false;
            if (statusFilter !== null && t.status !== statusFilter) return false;
            return true;
          });
        }),
        orderBy: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => ({
        where: vi.fn(async (predicate: any) => {
          const id = extractId(predicate);
          if (id !== null) {
            const t = tradesById.get(id);
            if (t) Object.assign(t, patch);
          }
        }),
      })),
    })),
    delete: vi.fn(),
  };

  return {
    db,
    botsTable: { __name: "bots", id: { __column: "id" } },
    tradeLogsTable: {
      __name: "trade_logs",
      id: idColumn,
      botId: botIdColumn,
      status: statusColumn,
      pnl: { __column: "pnl" },
      closedAt: { __column: "closed_at" },
    },
    apiKeysTable: { __name: "api_keys" },
    usersTable: { __name: "users" },
  };
});

const orderBookStore = new Map<
  string,
  { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[]; lastUpdateId: number; timestamp: number }
>();

vi.mock("../services/marketData", () => ({
  marketData: {
    getOrderBook: vi.fn((key: string) => orderBookStore.get(key.toLowerCase())),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isConnected: vi.fn(),
    getActiveSymbols: vi.fn(() => []),
    getRecentTrades: vi.fn(() => []),
    getBestBid: vi.fn(),
    getBestAsk: vi.fn(),
    shutdown: vi.fn(),
  },
}));

vi.mock("../services/dataProcessor", () => ({
  dataProcessor: {
    getVolatility: vi.fn(() => null),
  },
}));

vi.mock("../services/warmup", () => ({
  warmupSymbol: vi.fn(async () => {}),
}));

vi.mock("../services/riskManager", () => ({
  checkDailyDrawdown: vi.fn(() => ({ allowed: true })),
  checkWeeklyDrawdown: vi.fn(() => ({ allowed: true })),
  updateDailyPnl: vi.fn(async () => {}),
  pauseBot: vi.fn(async () => {}),
  pauseBotUntilNextMonday: vi.fn(async () => {}),
  killSwitch: vi.fn(async () => true),
  killAllBots: vi.fn(async () => 0),
  checkStopLoss: vi.fn(() => ({ allowed: true })),
}));

vi.mock("../services/tradingEvents", () => ({
  tradingEvents: {
    emitTradeEvent: vi.fn(),
  },
}));

vi.mock("../services/paperTrading", () => ({
  openPaperTrade: vi.fn(),
  closePaperTrade: vi.fn(async (tradeId: number) => {
    const t = tradesById.get(tradeId);
    if (t) {
      t.status = "closed";
      t.closedAt = new Date();
    }
    return { pnl: 0 };
  }),
}));

vi.mock("../services/liveTrading", () => ({
  openLiveTrade: vi.fn(),
  closeLiveTrade: vi.fn(async (tradeId: number) => {
    const t = tradesById.get(tradeId);
    if (t) {
      t.status = "closed";
      t.closedAt = new Date();
    }
    return { pnl: 0 };
  }),
}));

import { botManager } from "../services/botManager";
import { closePaperTrade as closePaperTradeMockImport } from "../services/paperTrading";
import { closeLiveTrade as closeLiveTradeMockImport } from "../services/liveTrading";
import { tradingEvents } from "../services/tradingEvents";
const closePaperTradeMock = closePaperTradeMockImport as unknown as ReturnType<typeof vi.fn>;
const closeLiveTradeMock = closeLiveTradeMockImport as unknown as ReturnType<typeof vi.fn>;
const emitTradeEventMock = tradingEvents.emitTradeEvent as unknown as ReturnType<typeof vi.fn>;

const MAX_TRADE_DURATION_MS = 30 * 60 * 1000;

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: 42,
    userId: 7,
    apiKeyId: null,
    name: "Test bot",
    pair: "BTC/USDT",
    mode: "paper",
    marketType: "spot",
    strategy: "trend_pullback",
    strategyParams: null,
    status: "running",
    leverage: 1,
    operationalLeverage: 1,
    capitalAllocated: "1000",
    aiConfidenceThreshold: "85.00",
    stopLossPercent: "2.00",
    maxDailyDrawdownPercent: "5.00",
    dailyPnl: "0",
    dailyPnlDate: null,
    pausedUntil: null,
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Bot;
}

function setOrderBook(symbol: string, bid: number, ask: number) {
  orderBookStore.set(symbol.toLowerCase(), {
    bids: [{ price: bid, quantity: 100 }],
    asks: [{ price: ask, quantity: 100 }],
    lastUpdateId: 1,
    timestamp: Date.now(),
  });
}

function seedTrade(overrides: Partial<TradeRow> = {}): TradeRow {
  const id = nextTradeId++;
  const row: TradeRow = {
    id,
    userId: 7,
    botId: 42,
    pair: "BTC/USDT",
    side: "long",
    mode: "paper",
    status: "open",
    entryPrice: "100.00000000",
    exitPrice: null,
    quantity: "10.00000000",
    pnl: null,
    commission: "0",
    slippage: "0",
    aiConfidence: "90",
    aiSignal: "test",
    aiTakeProfitPct: null,
    aiTp1Pct: "1.00",
    aiTp2Pct: "2.00",
    aiTp3Pct: "3.00",
    dynamicStopPct: "0.500",
    tpLevelReached: 0,
    trailingStopPrice: null,
    remainingQuantity: "10.00000000",
    realizedPnl: "0",
    openedAt: new Date(),
    closedAt: null,
    ...overrides,
  };
  tradesById.set(id, row);
  return row;
}

async function runReconcile(bot: Bot): Promise<void> {
  // reconcileOpenTrades is private; access via cast for testing.
  await (botManager as unknown as {
    reconcileOpenTrades: (botId: number, bot: Bot) => Promise<void>;
  }).reconcileOpenTrades(bot.id, bot);
}

beforeEach(() => {
  tradesById.clear();
  nextTradeId = 1;
  orderBookStore.clear();
  closePaperTradeMock.mockClear();
  closeLiveTradeMock.mockClear();
  emitTradeEventMock.mockClear();
});

describe("BotManager.reconcileOpenTrades — timeout por edad", () => {
  it("cierra un paper trade cuya edad supera MAX_TRADE_DURATION_MS y emite reason=timeout_reconcile", async () => {
    const bot = makeBot();
    const stale = new Date(Date.now() - (MAX_TRADE_DURATION_MS + 60_000));
    const trade = seedTrade({ openedAt: stale });

    // Order book within tolerance — not the trigger; age must be the reason.
    setOrderBook("btcusdt", 100, 100.05);

    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledTimes(1);
    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(closeLiveTradeMock).not.toHaveBeenCalled();
    expect(tradesById.get(trade.id)!.status).toBe("closed");
    expect(emitTradeEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "trade_closed",
        tradeId: trade.id,
        data: expect.objectContaining({ reason: "timeout_reconcile" }),
      }),
    );
  });

  it("cierra un live trade expirado vía closeLiveTrade(_, _, false) (no marca como stop-loss)", async () => {
    const bot = makeBot({ mode: "live", apiKeyId: 1 } as Partial<Bot>);
    const stale = new Date(Date.now() - (MAX_TRADE_DURATION_MS + 5_000));
    const trade = seedTrade({ mode: "live", openedAt: stale });

    setOrderBook("btcusdt", 100, 100.05);

    await runReconcile(bot);

    expect(closeLiveTradeMock).toHaveBeenCalledTimes(1);
    // 3rd arg is `isStopLoss`; on timeout it must be false.
    expect(closeLiveTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }), false);
    expect(closePaperTradeMock).not.toHaveBeenCalled();
  });

  it("no cierra un trade reciente cuando el precio sigue dentro de los rangos de SL", async () => {
    const bot = makeBot();
    const trade = seedTrade({ openedAt: new Date(), tpLevelReached: 0 });

    // Within stop-loss (dynamicStopPct=0.5%, drop only -0.2%) → no close.
    setOrderBook("btcusdt", 99.8, 99.85);

    await runReconcile(bot);

    expect(closePaperTradeMock).not.toHaveBeenCalled();
    expect(closeLiveTradeMock).not.toHaveBeenCalled();
    expect(tradesById.get(trade.id)!.status).toBe("open");
  });
});

describe("BotManager.reconcileOpenTrades — trailing stop reconciliado", () => {
  it("cierra un trade trend_pullback cuyo trailing stop debió activarse durante el downtime", async () => {
    const bot = makeBot({ strategy: "trend_pullback" });
    const trade = seedTrade({
      tpLevelReached: 2,
      trailingStopPrice: "101.49000000",
      remainingQuantity: "2.00000000",
    });

    // Long trade, current bid 101.30 < trailing 101.49 → trailing hit.
    setOrderBook("btcusdt", 101.3, 101.35);

    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
    expect(emitTradeEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "trade_closed",
        tradeId: trade.id,
        data: expect.objectContaining({ reason: "trailing_stop_reconcile" }),
      }),
    );
  });

  it("no cierra el trade cuando el precio sigue por encima del trailing stop", async () => {
    const bot = makeBot({ strategy: "trend_pullback" });
    seedTrade({
      tpLevelReached: 2,
      trailingStopPrice: "101.49000000",
      remainingQuantity: "2.00000000",
    });

    // Bid 102.50 > trailing 101.49 → not hit.
    setOrderBook("btcusdt", 102.5, 102.55);

    await runReconcile(bot);

    expect(closePaperTradeMock).not.toHaveBeenCalled();
    expect(closeLiveTradeMock).not.toHaveBeenCalled();
  });

  it("ignora el trailing en estrategias que no son trend_pullback (no fuerza cierre por ese camino)", async () => {
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"] });
    const trade = seedTrade({
      tpLevelReached: 2,
      trailingStopPrice: "101.49000000",
      remainingQuantity: "2.00000000",
      dynamicStopPct: null,
    });

    // Below the (irrelevant) trailing, but post-TP2 SL = -tp1 = -1%.
    // pctChange = (101.30 - 100)/100 = +1.30% → above -1% → must NOT close.
    setOrderBook("btcusdt", 101.3, 101.35);

    await runReconcile(bot);

    expect(closePaperTradeMock).not.toHaveBeenCalled();
    expect(closeLiveTradeMock).not.toHaveBeenCalled();
    expect(tradesById.get(trade.id)!.status).toBe("open");
  });
});

describe("BotManager.reconcileOpenTrades — SL inicial con dynamicStopPct", () => {
  it("usa dynamicStopPct (no bot.stopLossPercent) cuando el trade fresco aún no tiene TP1", async () => {
    // bot.stopLossPercent=2% → no dispararía con -0.6%, pero dynamicStopPct=0.5% sí.
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"], stopLossPercent: "2.00" });
    const trade = seedTrade({ dynamicStopPct: "0.500", tpLevelReached: 0 });

    setOrderBook("btcusdt", 99.4, 99.45);

    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
    expect(emitTradeEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "trade_closed",
        tradeId: trade.id,
        data: expect.objectContaining({ reason: "stop_loss_reconcile" }),
      }),
    );
  });

  it("para live trades de SL pasa isStopLoss=true a closeLiveTrade", async () => {
    const bot = makeBot({ mode: "live", apiKeyId: 1, strategy: "ai_scalper" as Bot["strategy"] } as Partial<Bot>);
    const trade = seedTrade({ mode: "live", dynamicStopPct: "0.500", tpLevelReached: 0 });

    setOrderBook("btcusdt", 99.4, 99.45);

    await runReconcile(bot);

    expect(closeLiveTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }), true);
  });

  it("cae a bot.stopLossPercent cuando dynamicStopPct es null", async () => {
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"], stopLossPercent: "2.00" });
    const trade = seedTrade({ dynamicStopPct: null, tpLevelReached: 0 });

    // Drop to -1% (below dynamic 0.5% but above bot SL 2%) → no close.
    setOrderBook("btcusdt", 99.0, 99.05);
    await runReconcile(bot);
    expect(closePaperTradeMock).not.toHaveBeenCalled();

    // Drop to -2.5% (below bot SL) → must close.
    setOrderBook("btcusdt", 97.5, 97.55);
    await runReconcile(bot);
    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });
});

describe("BotManager.reconcileOpenTrades — SL post-TP1 (breakeven ajustado por fees)", () => {
  it("cierra un trade post-TP1 (sin trailing) cuando pctChange cae al breakeven con fees", async () => {
    // Non-trend_pullback bot, tpLevelReached=1, no trailing → slThreshold = feeAdjBreakeven.
    // Spot fees → feeAdjBreakeven = 0.20 (positive). pctChange=0 (price at entry) ≤ 0.20 → close.
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"], marketType: "spot" });
    const trade = seedTrade({ tpLevelReached: 1, remainingQuantity: "5.00000000" });

    // Price back at entry → pctChange = 0 → must close (breakeven SL).
    setOrderBook("btcusdt", 99.95, 100.05);

    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
    expect(emitTradeEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "trade_closed",
        tradeId: trade.id,
        data: expect.objectContaining({ reason: "stop_loss_reconcile" }),
      }),
    );
  });

  it("también aplica el breakeven en trend_pullback post-TP1 cuando NO hay trailing seedado", async () => {
    const bot = makeBot({ strategy: "trend_pullback", marketType: "spot" });
    const trade = seedTrade({
      tpLevelReached: 1,
      remainingQuantity: "5.00000000",
      trailingStopPrice: null,
    });

    setOrderBook("btcusdt", 99.95, 100.05); // pctChange=0 ≤ feeAdjBreakeven 0.20 → close
    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });

  it("post-TP2 (no trend_pullback) usa SL=-tp1 y cierra cuando el precio cae por debajo", async () => {
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"] });
    const trade = seedTrade({
      tpLevelReached: 2,
      remainingQuantity: "2.50000000",
    });

    // tp1=1% → slThreshold = -1%. Drop to -1.2% → close.
    setOrderBook("btcusdt", 98.8, 98.85);

    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });

  it("no cierra el trade post-TP1 cuando pctChange está por encima del breakeven con fees", async () => {
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"], marketType: "spot" });
    seedTrade({ tpLevelReached: 1, remainingQuantity: "5.00000000" });

    // pctChange = +0.50% > feeAdjBreakeven 0.20 → no close.
    setOrderBook("btcusdt", 100.5, 100.55);

    await runReconcile(bot);

    expect(closePaperTradeMock).not.toHaveBeenCalled();
    expect(closeLiveTradeMock).not.toHaveBeenCalled();
  });
});

describe("BotManager.reconcileOpenTrades — aislamiento entre bots", () => {
  it("solo opera sobre los trades del bot indicado, no sobre los de otros bots", async () => {
    const targetBot = makeBot({ id: 42 });
    const otherBotId = 99;

    // Both trades expired and would otherwise be closed by the timeout branch.
    const stale = new Date(Date.now() - (MAX_TRADE_DURATION_MS + 60_000));
    const targetTrade = seedTrade({ botId: targetBot.id, openedAt: stale });
    const otherTrade = seedTrade({ botId: otherBotId, openedAt: stale });

    setOrderBook("btcusdt", 100, 100.05);

    await runReconcile(targetBot);

    expect(closePaperTradeMock).toHaveBeenCalledTimes(1);
    expect(closePaperTradeMock).toHaveBeenCalledWith(targetTrade.id, expect.objectContaining({ id: targetBot.id }));
    expect(closePaperTradeMock).not.toHaveBeenCalledWith(otherTrade.id, expect.anything());
    expect(tradesById.get(targetTrade.id)!.status).toBe("closed");
    expect(tradesById.get(otherTrade.id)!.status).toBe("open");
  });
});

describe("BotManager.reconcileOpenTrades — order book ausente", () => {
  it("no cierra un trade fresco cuando no hay order book disponible (deja que el monitor normal lo gestione)", async () => {
    const bot = makeBot();
    const trade = seedTrade({ openedAt: new Date() });

    // No order book seeded for btcusdt.

    await runReconcile(bot);

    expect(closePaperTradeMock).not.toHaveBeenCalled();
    expect(closeLiveTradeMock).not.toHaveBeenCalled();
    expect(tradesById.get(trade.id)!.status).toBe("open");
  });

  it("aún cierra por timeout cuando no hay order book (la rama de edad va antes del check de OB)", async () => {
    const bot = makeBot();
    const stale = new Date(Date.now() - (MAX_TRADE_DURATION_MS + 1_000));
    const trade = seedTrade({ openedAt: stale });

    await runReconcile(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });
});
