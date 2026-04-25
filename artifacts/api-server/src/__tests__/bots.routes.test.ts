import { describe, it, expect, beforeEach, vi } from "vitest";

const insertedValues: any[] = [];
const apiKeyOwners = new Map<number, number>();
// Pre-set the bot returned by db.select(botsTable) inside the PATCH route.
// Tests assign to this between calls; null means "bot not found".
let existingBot: any = null;
const updatedRows: any[] = [];

vi.mock("@workspace/db", () => {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn((row: any) => {
        insertedValues.push(row);
        return {
          returning: vi.fn(async () => [{ id: insertedValues.length, ...row, status: "stopped", createdAt: new Date(), updatedAt: new Date(), pausedUntil: null, dailyPnl: "0" }]),
        };
      }),
    })),
    select: vi.fn((projection?: any) => ({
      from: vi.fn((table: any) => ({
        where: vi.fn(async (predicate: any) => {
          if (predicate?.__apiKeyOwned) {
            return [{ id: predicate.__apiKeyOwned }];
          }
          // The route calls db.select() (no projection) on botsTable for bot
          // lookup, and db.select({id: ...}) on apiKeysTable for owner check.
          // Without a projection arg → bot lookup → return preconfigured bot.
          if (projection === undefined && table?.__name === "bots") {
            return existingBot ? [existingBot] : [];
          }
          return [];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((row: any) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            updatedRows.push(row);
            const merged = {
              ...(existingBot ?? {}),
              ...row,
              id: existingBot?.id ?? 1,
              status: existingBot?.status ?? "stopped",
              createdAt: existingBot?.createdAt ?? new Date(),
              updatedAt: new Date(),
              pausedUntil: existingBot?.pausedUntil ?? null,
              dailyPnl: existingBot?.dailyPnl ?? "0",
            };
            existingBot = merged;
            return [merged];
          }),
        })),
      })),
    })),
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

// botManager is touched by the routes module on import (start/stop/kill) but
// we don't drive any of those endpoints here — we just need the module to
// import cleanly without spinning up market subscriptions.
vi.mock("../services/botManager", () => ({
  botManager: {
    isRunning: vi.fn(() => false),
    startBot: vi.fn(async () => ({ success: true })),
    stopBot: vi.fn(async () => ({ success: true })),
    killBot: vi.fn(async () => ({ success: true })),
  },
}));

vi.mock("../services/marketData", () => ({
  marketData: {
    getActiveSymbols: vi.fn(() => []),
    isConnected: vi.fn(() => false),
    getOrderBook: vi.fn(() => undefined),
    getRecentTrades: vi.fn(() => []),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock("../services/riskManager", () => ({
  killSwitch: vi.fn(async () => true),
  killAllBots: vi.fn(async () => 0),
}));

vi.mock("../services/rateLimiter", () => ({
  rateLimiter: { getStatus: vi.fn(() => ({ used: 0, limit: 10, resetMs: 0 })) },
}));

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import botsRouter from "../routes/bots";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", botsRouter);
  return app;
}

function authToken(): string {
  // jwt lib uses JWT_SECRET or a development fallback secret. The middleware
  // verifies with the same fallback when JWT_SECRET is not set in non-prod.
  return jwt.sign({ userId: 1, email: "tester@example.com", role: "user" }, "dev-jwt-secret-not-for-production", { expiresIn: "1h" });
}

beforeEach(() => {
  insertedValues.length = 0;
  updatedRows.length = 0;
  existingBot = null;
  apiKeyOwners.clear();
  delete process.env.JWT_SECRET;
});

describe("POST /api/bots — Trend-Pullback validation", () => {
  it("creates a bot with strategy=trend_pullback, BTC/USDT, paper, spot", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend BTC",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
      });

    expect(res.status).toBe(201);
    expect(res.body.strategy).toBe("trend_pullback");
    expect(res.body.pair).toBe("BTC/USDT");
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0].strategy).toBe("trend_pullback");
  });

  it("accepts ETH/USDT for Trend-Pullback", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend ETH",
        strategy: "trend_pullback",
        pair: "ETH/USDT",
        mode: "paper",
        marketType: "spot",
      });
    expect(res.status).toBe(201);
    expect(res.body.pair).toBe("ETH/USDT");
  });

  it("rejects unsupported pair", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend SOL",
        strategy: "trend_pullback",
        pair: "SOL/USDT",
        mode: "paper",
        marketType: "spot",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/BTC\/USDT o ETH\/USDT/);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects live mode", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend live",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "live",
        marketType: "spot",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/paper/);
  });

  it("rejects futures market", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend futures",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "futures",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/spot/);
  });

  it("returns 401 without an auth token", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .send({
        name: "Anon",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
      });
    expect(res.status).toBe(401);
  });

  it("persists maxWeeklyDrawdownPercent when provided in the create body", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend custom DD",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        maxWeeklyDrawdownPercent: "7.5",
      });

    expect(res.status).toBe(201);
    expect(res.body.maxWeeklyDrawdownPercent).toBe("7.5");
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0].maxWeeklyDrawdownPercent).toBe("7.5");
  });

  it("falls back to the 10.00 default when maxWeeklyDrawdownPercent is omitted", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend default DD",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
      });

    expect(res.status).toBe(201);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0].maxWeeklyDrawdownPercent).toBe("10.00");
  });

  it("rejects maxWeeklyDrawdownPercent out of (0, 100] range on create", async () => {
    const app = makeApp();
    const tooBig = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Bad DD high",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        maxWeeklyDrawdownPercent: "150",
      });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatch(/semanal/i);

    const zero = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Bad DD zero",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        maxWeeklyDrawdownPercent: "0",
      });
    expect(zero.status).toBe(400);

    const garbage = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Bad DD garbage",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        maxWeeklyDrawdownPercent: "10abc",
      });
    expect(garbage.status).toBe(400);
  });
});

describe("PATCH /api/bots/:id — maxWeeklyDrawdownPercent edits", () => {
  it("updates maxWeeklyDrawdownPercent for an owned bot", async () => {
    existingBot = {
      id: 42,
      userId: 1,
      name: "Existing",
      strategy: "trend_pullback",
      pair: "BTC/USDT",
      mode: "paper",
      marketType: "spot",
      status: "stopped",
      maxWeeklyDrawdownPercent: "10.00",
      maxDailyDrawdownPercent: "5.00",
      createdAt: new Date(),
      updatedAt: new Date(),
      pausedUntil: null,
      dailyPnl: "0",
    };
    const app = makeApp();
    const res = await request(app)
      .patch("/api/bots/42")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({ maxWeeklyDrawdownPercent: "8.25" });

    expect(res.status).toBe(200);
    expect(res.body.maxWeeklyDrawdownPercent).toBe("8.25");
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0].maxWeeklyDrawdownPercent).toBe("8.25");
  });

  it("rejects out-of-range maxWeeklyDrawdownPercent on update", async () => {
    existingBot = {
      id: 42,
      userId: 1,
      name: "Existing",
      strategy: "trend_pullback",
      pair: "BTC/USDT",
      mode: "paper",
      marketType: "spot",
      status: "stopped",
      maxWeeklyDrawdownPercent: "10.00",
      maxDailyDrawdownPercent: "5.00",
      createdAt: new Date(),
      updatedAt: new Date(),
      pausedUntil: null,
      dailyPnl: "0",
    };
    const app = makeApp();
    const res = await request(app)
      .patch("/api/bots/42")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({ maxWeeklyDrawdownPercent: "0" });

    expect(res.status).toBe(400);
    expect(updatedRows).toHaveLength(0);
  });
});

describe("POST /api/bots — Trend-Pullback strategyParams validation", () => {
  it("accepts custom tp1/tp2/tp3 RR within constraints", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend custom TP",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        strategyParams: { tp1RR: 1.8, tp2RR: 2.5, tp3RR: 4.0 },
      });
    expect(res.status).toBe(201);
    expect(res.body.strategyParams).toEqual({ tp1RR: 1.8, tp2RR: 2.5, tp3RR: 4.0 });
    expect(insertedValues[0].strategyParams).toEqual({ tp1RR: 1.8, tp2RR: 2.5, tp3RR: 4.0 });
  });

  it("rejects tp1RR <= minimumRiskRewardNet", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend bad tp1",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        strategyParams: { tp1RR: 1.5, tp2RR: 3, tp3RR: 5 },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tp1RR.*minimumRiskRewardNet/);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects tp1RR >= tp2RR", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend tp1>=tp2",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        strategyParams: { tp1RR: 3, tp2RR: 3, tp3RR: 5 },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tp1RR.*menor que tp2RR/);
    expect(insertedValues).toHaveLength(0);
  });

  it("rejects tp2RR >= tp3RR", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend tp2>=tp3",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        strategyParams: { tp1RR: 2, tp2RR: 4, tp3RR: 4 },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tp2RR.*menor que tp3RR/);
    expect(insertedValues).toHaveLength(0);
  });

  it("validates against custom minimumRiskRewardNet sent in the same payload", async () => {
    const app = makeApp();
    const res = await request(app)
      .post("/api/bots")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({
        name: "Trend tight RR",
        strategy: "trend_pullback",
        pair: "BTC/USDT",
        mode: "paper",
        marketType: "spot",
        strategyParams: { tp1RR: 2, tp2RR: 3, tp3RR: 5, minimumRiskRewardNet: 2.5 },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tp1RR.*minimumRiskRewardNet/);
  });
});

describe("PATCH /api/bots/:id — Trend-Pullback strategyParams validation", () => {
  function seedBot(strategy: string = "trend_pullback", overrides: any = {}) {
    existingBot = {
      id: 1,
      userId: 1,
      name: "Existing",
      pair: "BTC/USDT",
      mode: "paper",
      marketType: "spot",
      strategy,
      strategyParams: null,
      status: "stopped",
      leverage: 1,
      operationalLeverage: 1,
      capitalAllocated: "100",
      aiConfidenceThreshold: "85.00",
      stopLossPercent: "0.20",
      maxDailyDrawdownPercent: "5.00",
      maxWeeklyDrawdownPercent: "10.00",
      dailyPnl: "0",
      weeklyPnl: "0",
      weeklyPnlWeekStart: null,
      apiKeyId: null,
      pausedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it("accepts a valid TP override and persists it", async () => {
    seedBot();
    const app = makeApp();
    const res = await request(app)
      .patch("/api/bots/1")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({ strategyParams: { tp1RR: 1.7, tp2RR: 2.4, tp3RR: 3.5 } });
    expect(res.status).toBe(200);
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows[0].strategyParams).toEqual({ tp1RR: 1.7, tp2RR: 2.4, tp3RR: 3.5 });
    expect(res.body.strategyParams).toEqual({ tp1RR: 1.7, tp2RR: 2.4, tp3RR: 3.5 });
  });

  it("rejects an invalid TP1 (<= minimumRiskRewardNet) on update", async () => {
    seedBot();
    const app = makeApp();
    const res = await request(app)
      .patch("/api/bots/1")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({ strategyParams: { tp1RR: 1.4, tp2RR: 3, tp3RR: 5 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tp1RR.*minimumRiskRewardNet/);
    expect(updatedRows).toHaveLength(0);
  });

  it("merges with existing strategyParams when the new payload only overrides a subset", async () => {
    seedBot("trend_pullback", {
      strategyParams: { tp1RR: 2.0, tp2RR: 3.0, tp3RR: 5.0 },
    });
    const app = makeApp();
    // Only tp3 is sent — but tp1/tp2 from the existing bot must hold the
    // tp1<tp2<tp3 invariant against the new value, so a tp3 below tp2 fails.
    const bad = await request(app)
      .patch("/api/bots/1")
      .set("Authorization", `Bearer ${authToken()}`)
      .send({ strategyParams: { tp3RR: 2.5 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/tp2RR.*menor que tp3RR/);
  });
});
