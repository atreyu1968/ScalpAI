import { describe, it, expect, beforeEach, vi } from "vitest";

const insertedValues: any[] = [];
const apiKeyOwners = new Map<number, number>();

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
      from: vi.fn((_table: any) => ({
        where: vi.fn(async (predicate: any) => {
          // The route only does select on apiKeysTable inside validateApiKeyOwnership.
          // We use the projection presence as a hint: { id: ... } means the apiKeys lookup.
          // For tests we either return empty (unowned key) or a match.
          if (predicate?.__apiKeyOwned) {
            return [{ id: predicate.__apiKeyOwned }];
          }
          return [];
        }),
      })),
    })),
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
});
