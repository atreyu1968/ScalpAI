import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import app from "./app";
import { logger } from "./lib/logger";
import { botManager } from "./services/botManager";
import { signalService } from "./services/signalService";
import { marketData } from "./services/marketData";

botManager.setSignalProvider((bot) => signalService.generateSignal(bot));
signalService.setPauseCallback((botId, reason) => botManager.pauseBotRuntime(botId, reason));
logger.info("AI signal provider (DeepSeek via OpenRouter) registered with bot manager");

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

const wss = new WebSocketServer({ server, path: "/ws/market" });

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
        subscribedSymbols.add(msg.symbol.toLowerCase());
        ws.send(JSON.stringify({ type: "subscribed", symbol: msg.symbol.toLowerCase() }));
      }
      if (msg.action === "unsubscribe" && typeof msg.symbol === "string") {
        subscribedSymbols.delete(msg.symbol.toLowerCase());
      }
    } catch {}
  });

  ws.on("close", () => {
    marketData.off("trade", onTrade);
    marketData.off("orderbook", onOrderBook);
    subscribedSymbols.clear();
  });
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + WebSocket)");
});
