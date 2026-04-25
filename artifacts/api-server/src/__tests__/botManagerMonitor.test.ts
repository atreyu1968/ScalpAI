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
  function extractId(predicate: any): number | null {
    if (!predicate) return null;
    if (predicate.__op === "eq" && predicate.col === idColumn) {
      return Number(predicate.val);
    }
    if (predicate.__op === "and") {
      for (const part of predicate.args) {
        const id = extractId(part);
        if (id !== null) return id;
      }
    }
    return null;
  }

  const db = {
    insert: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          // Used by monitorOpenTrades and other call sites that filter by botId+status="open"
          return Array.from(tradesById.values()).filter((t) => t.status === "open");
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
      botId: { __column: "bot_id" },
      status: { __column: "status" },
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
  updateDailyPnl: vi.fn(async () => {}),
  pauseBot: vi.fn(async () => {}),
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
  closeLiveTrade: vi.fn(),
}));

import { botManager } from "../services/botManager";
import { closePaperTrade as closePaperTradeMockImport } from "../services/paperTrading";
const closePaperTradeMock = closePaperTradeMockImport as unknown as ReturnType<typeof vi.fn>;

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

async function runMonitor(bot: Bot): Promise<void> {
  // monitorOpenTrades is a private method; access via cast for testing.
  await (botManager as unknown as {
    monitorOpenTrades: (botId: number, bot: Bot) => Promise<void>;
  }).monitorOpenTrades(bot.id, bot);
}

beforeEach(() => {
  tradesById.clear();
  nextTradeId = 1;
  orderBookStore.clear();
  closePaperTradeMock.mockClear();
});

// NOTE: Under the current implementation, Trend-Pullback intentionally
// exits the runner via the trailing stop (seeded at TP2, ratchets after
// +2R, closes on retrace). The explicit "TP3 → close" branch only fires
// for non-Trend-Pullback strategies and is covered by the legacy suite
// below. This differs from the wording in the original task spec, which
// pre-dates the trailing-stop change.
describe("BotManager.monitorOpenTrades — Trend-Pullback lifecycle", () => {
  it("partially closes 50% at TP1, 30% at TP2 (trend_pullback shares), seeds the trailing stop, and closes via trailing on a retrace", async () => {
    const bot = makeBot();
    const trade = seedTrade();

    // Stage 1: price reaches TP1 (+1%)
    setOrderBook("btcusdt", 101, 101.05);
    await runMonitor(bot);

    let updated = tradesById.get(trade.id)!;
    expect(updated.tpLevelReached).toBe(1);
    // trend_pullback uses tp1Share = 0.50 → 50% of 10 closed → 5 remaining
    expect(parseFloat(updated.remainingQuantity!)).toBeCloseTo(5, 8);
    // Realized PnL ≈ (101 - 100) * 5 = 5
    expect(parseFloat(updated.realizedPnl!)).toBeCloseTo(5, 6);
    expect(updated.trailingStopPrice).toBeNull();
    expect(updated.status).toBe("open");

    // Stage 2: price reaches TP2 (+2%) → close another 30% of original (3),
    // total realized 5 + 3*2 = 11; trailing stop seeded at 102 * (1 - 0.005) = 101.49
    setOrderBook("btcusdt", 102, 102.05);
    await runMonitor(bot);
    updated = tradesById.get(trade.id)!;
    expect(updated.tpLevelReached).toBe(2);
    expect(parseFloat(updated.remainingQuantity!)).toBeCloseTo(2, 8);
    expect(parseFloat(updated.realizedPnl!)).toBeCloseTo(11, 6);
    expect(updated.trailingStopPrice).not.toBeNull();
    expect(parseFloat(updated.trailingStopPrice!)).toBeCloseTo(101.49, 6);
    expect(updated.status).toBe("open");

    // Stage 3: price moves further up (+3%) → trailing should ratchet up
    setOrderBook("btcusdt", 103, 103.05);
    await runMonitor(bot);
    updated = tradesById.get(trade.id)!;
    expect(parseFloat(updated.trailingStopPrice!)).toBeCloseTo(102.485, 6);
    expect(updated.status).toBe("open");

    // Stage 4: price retraces below trailing → trade closes via trailing stop
    setOrderBook("btcusdt", 102.4, 102.45);
    await runMonitor(bot);
    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });

  it("uses the breakeven SL post-TP1 (trailing inactive) when pctChange dips ≤ 0", async () => {
    const bot = makeBot();
    const trade = seedTrade({ tpLevelReached: 1, remainingQuantity: "5.00000000" });

    // Price drops back to entry → pctChange = 0 → should hit the
    // post-TP1 breakeven branch (trailing inactive).
    setOrderBook("btcusdt", 99.95, 100.05);
    await runMonitor(bot);

    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });

  it("uses dynamicStopPct (not bot.stopLossPercent) for the initial stop-loss when present", async () => {
    // bot.stopLossPercent is 2% (would NOT trigger at -0.6%), but
    // dynamicStopPct of 0.5% MUST trigger the close.
    const bot = makeBot({ stopLossPercent: "2.00" });
    const trade = seedTrade({ dynamicStopPct: "0.500" });

    // First, a draw at -0.4% must NOT fire the SL (between dynamic and bot SL)
    setOrderBook("btcusdt", 99.6, 99.7);
    await runMonitor(bot);
    expect(closePaperTradeMock).not.toHaveBeenCalled();
    expect(tradesById.get(trade.id)!.status).toBe("open");

    // Now drop to -0.6% — past the dynamic stop → must close
    setOrderBook("btcusdt", 99.4, 99.5);
    await runMonitor(bot);
    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(tradesById.get(trade.id)!.status).toBe("closed");
  });

  it("does NOT trigger the dynamic stop-loss in the same window when dynamicStopPct is absent (falls back to bot.stopLossPercent)", async () => {
    const bot = makeBot({ stopLossPercent: "2.00" });
    seedTrade({ dynamicStopPct: null });

    // Drop to -0.6% — well above bot.stopLossPercent (2%) and no dynamic stop → no close
    setOrderBook("btcusdt", 99.4, 99.5);
    await runMonitor(bot);
    expect(closePaperTradeMock).not.toHaveBeenCalled();
  });
});

describe("BotManager.monitorOpenTrades — non-trend_pullback TP3 close", () => {
  it("closes 40% at TP1, 35% at TP2, then completes at TP3 (legacy partial shares)", async () => {
    const bot = makeBot({ strategy: "ai_scalper" as Bot["strategy"] });
    const trade = seedTrade({ dynamicStopPct: null });

    // TP1 (+1%) → tp1Share = 0.40 → 4 closed, 6 remaining; realized = 4*1 = 4
    setOrderBook("btcusdt", 101, 101.05);
    await runMonitor(bot);
    let updated = tradesById.get(trade.id)!;
    expect(updated.tpLevelReached).toBe(1);
    expect(parseFloat(updated.remainingQuantity!)).toBeCloseTo(6, 8);
    expect(parseFloat(updated.realizedPnl!)).toBeCloseTo(4, 6);
    expect(updated.status).toBe("open");

    // TP2 (+2%) → tp2Share = 0.35 → 3.5 closed, 2.5 remaining; realized += 3.5*2 = 7 → total 11
    setOrderBook("btcusdt", 102, 102.05);
    await runMonitor(bot);
    updated = tradesById.get(trade.id)!;
    expect(updated.tpLevelReached).toBe(2);
    expect(parseFloat(updated.remainingQuantity!)).toBeCloseTo(2.5, 8);
    expect(parseFloat(updated.realizedPnl!)).toBeCloseTo(11, 6);
    expect(updated.status).toBe("open");
    // No trailing stop on legacy strategies
    expect(updated.trailingStopPrice).toBeNull();

    // TP3 (+3%) → tpLevelReached=3 then closePaperTrade → trade closed
    setOrderBook("btcusdt", 103, 103.05);
    await runMonitor(bot);
    updated = tradesById.get(trade.id)!;
    expect(updated.tpLevelReached).toBe(3);
    expect(closePaperTradeMock).toHaveBeenCalledWith(trade.id, expect.objectContaining({ id: bot.id }));
    expect(updated.status).toBe("closed");
  });
});
