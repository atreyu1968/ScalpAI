import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { botManager } from "./services/botManager";
import { signalService } from "./services/signalService";
import { marketData } from "./services/marketData";
import { dataProcessor } from "./services/dataProcessor";
import { tradingEvents, type TradingEvent } from "./services/tradingEvents";
import { verifyToken } from "./lib/jwt";
import { warmupAllActive } from "./services/warmup";

dataProcessor.init();
botManager.setSignalProvider((bot) => signalService.generateSignal(bot));
signalService.setPauseCallback((botId, reason) => botManager.pauseBotRuntime(botId, reason));
logger.info("AI signal provider with pattern recognition registered");

(async () => {
  try {
    const { db, aiSettingsTable, botsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    const [settings] = await db.select().from(aiSettingsTable);
    if (settings?.signalIntervalS) {
      signalService.setBatchInterval(settings.signalIntervalS * 1000);
      logger.info({ intervalS: settings.signalIntervalS }, "AI signal interval loaded from DB");
    }

    const runningBots = await db.select().from(botsTable).where(eq(botsTable.status, "running"));

    if (runningBots.length > 0) {
      const pairsToWarm = runningBots.map((b) => ({
        pair: b.pair,
        useFutures: b.mode === "futures_paper" || b.mode === "futures_live",
      }));
      await warmupAllActive(pairsToWarm);
    }

    for (const bot of runningBots) {
      const result = await botManager.startBot(bot.id);
      if (result.success) {
        logger.info({ botId: bot.id, pair: bot.pair, mode: bot.mode }, "Bot auto-resumed on startup");
      } else {
        logger.warn({ botId: bot.id, error: result.error }, "Failed to auto-resume bot");
      }
    }
    if (runningBots.length > 0) {
      logger.info({ count: runningBots.length }, "Bots auto-resume complete");
    }
  } catch (err) {
    logger.error({ err }, "Error during startup initialization");
  }
})();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws/market", verifyClient: (info, cb) => {
  try {
    const url = new URL(info.req.url || "", "http://localhost");
    const token = url.searchParams.get("token") || "";
    if (!token) {
      cb(false, 401, "Authentication required");
      return;
    }
    verifyToken(token);
    cb(true);
  } catch {
    cb(false, 401, "Invalid token");
  }
} });

const wsClients = new Map<WebSocket, { userId: number; subscribedSymbols: Set<string> }>();

tradingEvents.on("trading", (event: TradingEvent) => {
  const payload = JSON.stringify({ type: "trading_event", event });
  for (const [ws, meta] of wsClients) {
    if (meta.userId === event.userId && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "", "http://localhost");
  const token = url.searchParams.get("token") || "";
  let userId = 0;
  try {
    const payload = verifyToken(token);
    userId = payload.userId;
  } catch {}

  const subscribedSymbols = new Set<string>();
  wsClients.set(ws, { userId, subscribedSymbols });

  let onTrade: ((key: string, trade: { price: number; quantity: number; time: number; isBuyerMaker: boolean }) => void) | null = null;
  let onOrderBook: ((key: string, ob: { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[] }) => void) | null = null;

  function ensureMarketListeners() {
    if (onTrade) return;
    onTrade = (key, trade) => {
      if (subscribedSymbols.has(key) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "trade", symbol: key, data: trade }));
      }
    };
    onOrderBook = (key, ob) => {
      if (subscribedSymbols.has(key) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "orderbook",
          symbol: key,
          data: {
            bids: ob.bids.slice(0, 15),
            asks: ob.asks.slice(0, 15),
          },
        }));
      }
    };
    marketData.on("trade", onTrade);
    marketData.on("orderbook", onOrderBook);
  }

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === "subscribe" && typeof msg.symbol === "string") {
        ensureMarketListeners();
        const sym = msg.symbol.toLowerCase();
        subscribedSymbols.add(sym);
        subscribedSymbols.add(`f:${sym}`);
        const pair = sym.replace(/usdt$/, "/usdt").replace(/eur$/, "/eur").replace(/btc$/, "/btc").toUpperCase();
        marketData.subscribe(pair, false);
        ws.send(JSON.stringify({ type: "subscribed", symbol: sym }));
      }
      if (msg.action === "unsubscribe" && typeof msg.symbol === "string") {
        const sym = msg.symbol.toLowerCase();
        subscribedSymbols.delete(sym);
        subscribedSymbols.delete(`f:${sym}`);
        const pair = sym.replace(/usdt$/, "/usdt").replace(/eur$/, "/eur").replace(/btc$/, "/btc").toUpperCase();
        marketData.unsubscribe(pair, false);
      }
    } catch {}
  });

  ws.on("close", () => {
    if (onTrade) marketData.off("trade", onTrade);
    if (onOrderBook) marketData.off("orderbook", onOrderBook);
    wsClients.delete(ws);
    for (const sym of subscribedSymbols) {
      if (!sym.startsWith("f:")) {
        const pair = sym.replace(/usdt$/, "/usdt").replace(/eur$/, "/eur").replace(/btc$/, "/btc").toUpperCase();
        marketData.unsubscribe(pair, false);
      }
    }
    subscribedSymbols.clear();
  });
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});
