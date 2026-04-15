import http from "node:http";
import { parse as parseUrl } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { botManager } from "./services/botManager";
import { signalService } from "./services/signalService";
import { marketData } from "./services/marketData";
import { verifyToken } from "./lib/jwt";

botManager.setSignalProvider((bot) => signalService.generateSignal(bot));
signalService.setPauseCallback((botId, reason) => botManager.pauseBotRuntime(botId, reason));
logger.info("AI signal provider (DeepSeek) registered with bot manager");

(async () => {
  try {
    const { db, aiSettingsTable } = await import("@workspace/db");
    const [settings] = await db.select().from(aiSettingsTable);
    if (settings?.signalIntervalS) {
      signalService.setBatchInterval(settings.signalIntervalS * 1000);
      logger.info({ intervalS: settings.signalIntervalS }, "AI signal interval loaded from DB");
    }
  } catch {}
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
    const url = parseUrl(info.req.url || "", true);
    const token = url.query.token as string;
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

wss.on("connection", (ws) => {
  let subscribedSymbols = new Set<string>();

  const onTrade = (key: string, trade: { price: number; quantity: number; time: number; isBuyerMaker: boolean }) => {
    if (subscribedSymbols.has(key) && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "trade", symbol: key, data: trade }));
    }
  };

  const onOrderBook = (key: string, ob: { bids: { price: number; quantity: number }[]; asks: { price: number; quantity: number }[] }) => {
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

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.action === "subscribe" && typeof msg.symbol === "string") {
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
    marketData.off("trade", onTrade);
    marketData.off("orderbook", onOrderBook);
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
