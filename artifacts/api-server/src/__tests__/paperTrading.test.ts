import { describe, it, expect, beforeEach, vi } from "vitest";

const insertedRows: any[] = [];
const insertedValues: any[] = [];

vi.mock("@workspace/db", () => {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => {
        insertedValues.push(row);
        return {
          returning: vi.fn(async () => {
            const created = { id: insertedValues.length, ...row };
            insertedRows.push(created);
            return [created];
          }),
        };
      }),
    })),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db,
    botsTable: { __name: "bots" },
    tradeLogsTable: { __name: "trade_logs" },
    apiKeysTable: { __name: "api_keys" },
    usersTable: { __name: "users" },
  };
});

const orderBookStore = new Map<string, { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[]; lastUpdateId: number; timestamp: number }>();

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

vi.mock("../services/riskManager", () => ({
  checkDailyDrawdown: vi.fn(() => ({ allowed: true })),
  updateDailyPnl: vi.fn(async () => {}),
  pauseBot: vi.fn(async () => {}),
  killSwitch: vi.fn(async () => true),
  killAllBots: vi.fn(async () => 0),
  checkStopLoss: vi.fn(() => ({ allowed: true })),
}));

import { openPaperTrade } from "../services/paperTrading";
import type { Bot } from "@workspace/db";

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
    capitalAllocated: "100",
    aiConfidenceThreshold: "85.00",
    stopLossPercent: "0.20",
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

beforeEach(() => {
  insertedRows.length = 0;
  insertedValues.length = 0;
  orderBookStore.clear();
});

describe("openPaperTrade with Trend-Pullback inputs", () => {
  it("persists dynamicStopPct and uses positionSizeUsdt for sizing when provided", async () => {
    const bot = makeBot({ capitalAllocated: "1000", operationalLeverage: 1 });
    setOrderBook("btcusdt", 99_999, 100_001);

    const dynamicStopPct = 1.234;
    const positionSizeUsdt = 75; // capital*leverage = 1000, so this is the binding cap

    const res = await openPaperTrade(
      bot,
      "long",
      100,
      "test-signal",
      undefined,
      1.5,
      2.5,
      4.0,
      dynamicStopPct,
      positionSizeUsdt,
    );

    expect("tradeId" in res).toBe(true);
    expect(insertedValues).toHaveLength(1);
    const row = insertedValues[0];

    // dynamicStopPct serialised with 3 decimals
    expect(row.dynamicStopPct).toBe(dynamicStopPct.toFixed(3));

    // Quantity should be derived from positionSizeUsdt / entryPrice (with slippage)
    const entryPrice = parseFloat(row.entryPrice);
    const qty = parseFloat(row.quantity);
    // 8-decimal rounding on quantity introduces tiny notional drift
    expect(qty * entryPrice).toBeCloseTo(positionSizeUsdt, 2);

    // TP fields are persisted as fixed(2) strings
    expect(row.aiTp1Pct).toBe("1.50");
    expect(row.aiTp2Pct).toBe("2.50");
    expect(row.aiTp3Pct).toBe("4.00");

    // Other invariants
    expect(row.side).toBe("long");
    expect(row.mode).toBe("paper");
    expect(row.status).toBe("open");
    expect(parseFloat(row.remainingQuantity)).toBeCloseTo(qty, 8);
  });

  it("caps positionSizeUsdt at capital * operationalLeverage", async () => {
    const bot = makeBot({ capitalAllocated: "100", operationalLeverage: 2 });
    setOrderBook("btcusdt", 9_999, 10_001);

    // Request a notional larger than the available margin
    const requested = 10_000;

    const res = await openPaperTrade(
      bot,
      "long",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0.5,
      requested,
    );

    expect("tradeId" in res).toBe(true);
    const row = insertedValues[0];
    const entryPrice = parseFloat(row.entryPrice);
    const qty = parseFloat(row.quantity);
    const notional = qty * entryPrice;
    // Capped at capital * operationalLeverage = 100 * 2 = 200
    expect(notional).toBeCloseTo(200, 4);
  });

  it("falls back to capital * leverage when positionSizeUsdt is not provided", async () => {
    const bot = makeBot({ capitalAllocated: "500", operationalLeverage: 1 });
    setOrderBook("btcusdt", 49_999, 50_001);

    const res = await openPaperTrade(bot, "long");
    expect("tradeId" in res).toBe(true);
    const row = insertedValues[0];
    const entryPrice = parseFloat(row.entryPrice);
    const qty = parseFloat(row.quantity);
    expect(qty * entryPrice).toBeCloseTo(500, 2);
    // No dynamic stop pct provided → field absent / null in the insert payload
    expect(row.dynamicStopPct).toBeUndefined();
  });

  it("returns an error when no order book data is available", async () => {
    const bot = makeBot();
    // intentionally no order book
    const res = await openPaperTrade(bot, "long");
    expect("error" in res).toBe(true);
    expect(insertedValues).toHaveLength(0);
  });
});
