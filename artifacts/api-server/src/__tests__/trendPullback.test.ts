import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Kline } from "../services/klines";
import { ema, rsi, atr } from "../services/klines";

vi.mock("@workspace/db", () => ({
  db: {},
  botsTable: {},
  tradeLogsTable: {},
  apiKeysTable: {},
}));

const klinesStore = new Map<string, Kline[]>();

vi.mock("../services/klines", async () => {
  const actual = await vi.importActual<typeof import("../services/klines")>(
    "../services/klines",
  );
  return {
    ...actual,
    klinesService: {
      loadInitial: vi.fn(async (_symbol: string, _interval: string) => {
        return [];
      }),
      subscribe: vi.fn(() => () => {}),
      getClosedKlines: vi.fn((symbol: string, interval: string) => {
        return klinesStore.get(`${symbol.toUpperCase()}@${interval}`) ?? null;
      }),
      getKlines: vi.fn((symbol: string, interval: string) => {
        return klinesStore.get(`${symbol.toUpperCase()}@${interval}`) ?? null;
      }),
      shutdown: vi.fn(),
    },
  };
});

const orderBookStore = new Map<string, { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[] }>();

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

import { generateTrendPullbackSignal, computePositionSize, DEFAULT_TREND_PULLBACK, getLastDecision } from "../services/trendPullback";

type Bot = Parameters<typeof generateTrendPullbackSignal>[0];

function makeBot(overrides: Partial<Bot> = {}): Bot {
  const base = {
    id: 1,
    userId: 1,
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
    stopLossPercent: "0.20",
    maxDailyDrawdownPercent: "5.00",
    dailyPnl: "0",
    dailyPnlDate: null,
    pausedUntil: null,
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Bot;
  return { ...base, ...overrides } as Bot;
}

function buildKline(i: number, close: number, prevClose: number): Kline {
  const open = prevClose;
  const high = Math.max(open, close) * 1.001;
  const low = Math.min(open, close) * 0.999;
  return {
    openTime: i * 60_000,
    open,
    high,
    low,
    close,
    volume: 100,
    closeTime: (i + 1) * 60_000,
    isClosed: true,
  };
}

function buildSeries(closes: number[]): Kline[] {
  const out: Kline[] = [];
  let prev = closes[0];
  for (let i = 0; i < closes.length; i++) {
    out.push(buildKline(i, closes[i], prev));
    prev = closes[i];
  }
  return out;
}

function setKlines(symbol: string, interval: string, klines: Kline[]): void {
  klinesStore.set(`${symbol.toUpperCase()}@${interval}`, klines);
}

function setOrderBook(symbol: string, bid: number, ask: number): void {
  orderBookStore.set(symbol.toLowerCase(), {
    bids: [{ price: bid, quantity: 10 }],
    asks: [{ price: ask, quantity: 10 }],
  });
}

function buildBullish4hSeries(n = 250, base = 1000, step = 1.5): number[] {
  const closes: number[] = [];
  for (let i = 0; i < n; i++) {
    closes.push(base + i * step + Math.sin(i * 0.3) * 4);
  }
  return closes;
}

beforeEach(() => {
  klinesStore.clear();
  orderBookStore.clear();
});

describe("generateTrendPullbackSignal", () => {
  it("rejects unsupported pairs", async () => {
    const bot = makeBot({ pair: "DOGE/USDT" });
    const signal = await generateTrendPullbackSignal(bot);
    expect(signal).toBeNull();
  });

  it("returns null while warming up if not enough 4h klines", async () => {
    const bot = makeBot();
    setKlines("BTC/USDT", "4h", buildSeries([1000, 1001, 1002])); // way too few
    setKlines("BTC/USDT", "1h", buildSeries(buildBullish4hSeries(250)));
    setOrderBook("btcusdt", 1000, 1000.5);
    const signal = await generateTrendPullbackSignal(bot);
    expect(signal).toBeNull();
  });

  it("rejects when 4h trend is bearish", async () => {
    const bot = makeBot();
    // descending series → close < ema200
    const downCloses: number[] = [];
    for (let i = 0; i < 250; i++) downCloses.push(2000 - i * 1.5);
    setKlines("BTC/USDT", "4h", buildSeries(downCloses));
    setKlines("BTC/USDT", "1h", buildSeries(buildBullish4hSeries(250)));
    setOrderBook("btcusdt", downCloses[downCloses.length - 1], downCloses[downCloses.length - 1] + 0.5);
    const signal = await generateTrendPullbackSignal(bot);
    expect(signal).toBeNull();
  });

  it("rejects when there is no order book data", async () => {
    const bot = makeBot();
    const closes = buildBullish4hSeries(250);
    setKlines("BTC/USDT", "4h", buildSeries(closes));
    setKlines("BTC/USDT", "1h", buildSeries(closes));
    // intentionally no order book
    const signal = await generateTrendPullbackSignal(bot);
    expect(signal).toBeNull();
  });

  it("rejects when the spread is too wide", async () => {
    const bot = makeBot();
    const closes = buildBullish4hSeries(250);
    setKlines("BTC/USDT", "4h", buildSeries(closes));
    // build 1h series with a pullback at the end
    const closes1h = buildBullish4hSeries(250);
    const ema50 = ema(closes1h, 50);
    const lastEma = ema50[ema50.length - 1];
    closes1h[closes1h.length - 2] = lastEma * 1.001;
    closes1h[closes1h.length - 1] = lastEma * 1.002;
    setKlines("BTC/USDT", "1h", buildSeries(closes1h));
    const last = closes1h[closes1h.length - 1];
    // 1% spread (way above default 0.05%)
    setOrderBook("btcusdt", last * 0.99, last * 1.01);
    const signal = await generateTrendPullbackSignal(bot);
    expect(signal).toBeNull();
  });

  it("emits a long signal with TP1/TP2/TP3, dynamicStopPct and positionSizeUsdt when conditions are met", async () => {
    // NOTE: The current default `minimumRiskRewardNet` (1.5) is mathematically
    // unreachable with `tp1RR = 1.5` because of fees, so we relax it via
    // `strategyParams` to verify the wiring around signal generation. This
    // shortcoming is recorded as a follow-up task.
    const bot = makeBot({
      capitalAllocated: "10000",
      strategyParams: { minimumRiskRewardNet: 1.0 } as unknown as Bot["strategyParams"],
    });

    // 4h bullish: monotonic uptrend gives close > ema200, ema50 > ema200
    const closes4h = buildBullish4hSeries(250, 1000, 1.5);
    setKlines("BTC/USDT", "4h", buildSeries(closes4h));

    // 1h: build an oscillating gentle uptrend so RSI naturally hovers ~50.
    // Then engineer the last candle so its `low` touches EMA50 (proximity)
    // while its `close` stays just above EMA50 (so close > EMA50, RSI safe).
    const closes1h: number[] = [];
    for (let i = 0; i < 250; i++) {
      // Slow trend + alternating up/down so RSI ≈ 50 most of the time.
      const trend = 1000 + i * 0.15;
      const oscillation = i % 2 === 0 ? 1.5 : -1.5;
      closes1h.push(trend + oscillation);
    }
    // Snap the last close to slightly above the would-be EMA50 of the modified
    // series so close > EMA50 holds and RSI stays in [40,60].
    let ema50 = ema(closes1h, 50);
    let lastEma = ema50[ema50.length - 1];
    closes1h[closes1h.length - 1] = lastEma * 1.0008;
    // Recompute EMA50 after the tweak — only the very last value moves a bit.
    ema50 = ema(closes1h, 50);
    lastEma = ema50[ema50.length - 1];

    const klines1h = buildSeries(closes1h);
    // Widen all candle wicks (~1% range) so ATR is large enough that the
    // 1.5×ATR dynamic stop clears the `minimumStopDistance` (0.8%) floor.
    for (const k of klines1h) {
      const mid = (k.open + k.close) / 2;
      k.high = Math.max(k.high, mid * 1.005);
      k.low = Math.min(k.low, mid * 0.995);
    }
    // Force the last candle's low to dip into the EMA50 zone so the
    // pullback-proximity check (≤ EMA50 * (1 + 0.005)) succeeds.
    klines1h[klines1h.length - 1].low = lastEma * 0.999;

    setKlines("BTC/USDT", "1h", klines1h);

    const lastClose = closes1h[closes1h.length - 1];
    setOrderBook("btcusdt", lastClose - 0.02, lastClose + 0.02);

    const signal = await generateTrendPullbackSignal(bot);

    // Sanity check: the engineered RSI should land inside the configured range.
    const lastRsi = rsi(closes1h, DEFAULT_TREND_PULLBACK.rsiPeriod).at(-1)!;
    expect(lastRsi, "engineered RSI must land inside the configured range").toBeGreaterThanOrEqual(DEFAULT_TREND_PULLBACK.rsiMin);
    expect(lastRsi).toBeLessThanOrEqual(DEFAULT_TREND_PULLBACK.rsiMax);

    if (signal === null) {
      const decision = getLastDecision(1);
      throw new Error(`expected a signal, got null. reason=${decision?.reason} details=${JSON.stringify(decision?.details)}`);
    }
    expect(signal, "expected a long signal but received null").not.toBeNull();
    expect(signal!.side).toBe("long");
    expect(signal!.tp1Pct).toBeGreaterThan(0);
    expect(signal!.tp2Pct).toBeGreaterThan(signal!.tp1Pct!);
    expect(signal!.tp3Pct).toBeGreaterThan(signal!.tp2Pct!);
    expect(signal!.dynamicStopPct).toBeGreaterThan(DEFAULT_TREND_PULLBACK.minimumStopDistance * 100 - 1e-6);
    expect(signal!.positionSizeUsdt).toBeGreaterThan(0);

    // dynamic stop pct (in %) and position size should be self-consistent
    // with the risk model: positionSizeUsdt = (capital * riskPerTrade) / (stopPct + estimatedFees).
    const stopFraction = signal!.dynamicStopPct! / 100;
    const expected = computePositionSize(bot, stopFraction);
    expect(signal!.positionSizeUsdt).toBeCloseTo(expected, 6);
  });
});

describe("computePositionSize", () => {
  it("scales notional with risk-per-trade and stop distance", () => {
    const bot = makeBot({ capitalAllocated: "10000" });
    const size1pct = computePositionSize(bot, 0.01); // 1% stop
    const size2pct = computePositionSize(bot, 0.02); // 2% stop
    // Tighter stop allows a larger position
    expect(size1pct).toBeGreaterThan(size2pct);
    // Risk monetary = 10000 * 0.005 = 50; size ≈ 50 / (0.01 + 0.0025)
    const riskMoney = 10000 * DEFAULT_TREND_PULLBACK.riskPerTrade;
    expect(size1pct).toBeCloseTo(riskMoney / (0.01 + DEFAULT_TREND_PULLBACK.estimatedFees), 6);
  });

  it("returns 0 when total risk is non-positive", () => {
    const bot = makeBot({ capitalAllocated: "1000" });
    expect(computePositionSize(bot, -DEFAULT_TREND_PULLBACK.estimatedFees)).toBe(0);
  });
});

describe("indicator helpers", () => {
  it("computes EMA with a known sequence", () => {
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(1);
    // EMA should grow monotonically with monotonic input
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThan(out[i - 1]);
    }
  });

  it("computes RSI of a constant series as no-op (NaN until period, then 100 once)", () => {
    const closes = new Array(20).fill(100);
    const out = rsi(closes, 14);
    expect(out).toHaveLength(20);
    // First period values are NaN
    for (let i = 0; i < 14; i++) expect(Number.isNaN(out[i])).toBe(true);
    // No movement → RSI undefined-but-our-impl returns 100 (avgLoss === 0)
    expect(out[14]).toBe(100);
  });

  it("computes ATR on synthetic candles and produces positive values", () => {
    const closes = buildBullish4hSeries(60, 1000, 0.8);
    const klines = buildSeries(closes);
    const out = atr(klines, 14);
    const last = out.at(-1)!;
    expect(Number.isFinite(last)).toBe(true);
    expect(last).toBeGreaterThan(0);
  });
});
