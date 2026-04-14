import WebSocket from "ws";
import { EventEmitter } from "node:events";
import { logger } from "../lib/logger";

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  timestamp: number;
}

export interface TradeEvent {
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const ORDERBOOK_DEPTH = 20;
const MAX_RECENT_TRADES = 200;

class MarketDataService extends EventEmitter {
  private connections: Map<string, WebSocket> = new Map();
  private orderBooks: Map<string, OrderBook> = new Map();
  private recentTrades: Map<string, TradeEvent[]> = new Map();
  private subscriptionCounts: Map<string, number> = new Map();
  private reconnectDelays: Map<string, number> = new Map();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  getOrderBook(key: string): OrderBook | undefined {
    return this.orderBooks.get(key.toLowerCase());
  }

  getBestBid(key: string): number | undefined {
    const ob = this.getOrderBook(key);
    return ob && ob.bids.length > 0 ? ob.bids[0].price : undefined;
  }

  getRecentTrades(key: string, limit: number = 50): TradeEvent[] {
    const trades = this.recentTrades.get(key.toLowerCase()) ?? [];
    return trades.slice(-limit);
  }

  getBestAsk(key: string): number | undefined {
    const ob = this.getOrderBook(key);
    return ob && ob.asks.length > 0 ? ob.asks[0].price : undefined;
  }

  subscribe(pair: string, useFutures: boolean = false): void {
    const symbol = pair.replace("/", "").toLowerCase();
    const key = useFutures ? `f:${symbol}` : symbol;
    const count = this.subscriptionCounts.get(key) ?? 0;
    this.subscriptionCounts.set(key, count + 1);

    if (count === 0) {
      this.connect(symbol, useFutures);
    }
  }

  unsubscribe(pair: string, useFutures: boolean = false): void {
    const symbol = pair.replace("/", "").toLowerCase();
    const key = useFutures ? `f:${symbol}` : symbol;
    const count = this.subscriptionCounts.get(key) ?? 0;
    if (count <= 1) {
      this.subscriptionCounts.delete(key);
      this.disconnect(key);
    } else {
      this.subscriptionCounts.set(key, count - 1);
    }
  }

  private connect(symbol: string, useFutures: boolean = false): void {
    const key = useFutures ? `f:${symbol}` : symbol;
    if (this.connections.has(key)) return;

    const streams = `${symbol}@depth${ORDERBOOK_DEPTH}@100ms/${symbol}@trade`;
    const baseUrl = useFutures
      ? "wss://fstream.binance.com/stream"
      : "wss://stream.binance.com:9443/stream";
    const url = `${baseUrl}?streams=${streams}`;

    logger.info({ symbol: key, url }, "Connecting to Binance WebSocket");

    const ws = new WebSocket(url);
    this.connections.set(key, ws);

    ws.on("open", () => {
      logger.info({ symbol: key }, "Binance WebSocket connected");
      this.reconnectDelays.set(key, INITIAL_RECONNECT_DELAY);
      this.emit("connected", key);
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg.stream || !msg.data) return;

        if (msg.stream.includes("@depth")) {
          this.handleDepthUpdate(key, msg.data);
        } else if (msg.stream.includes("@trade")) {
          this.handleTradeEvent(key, msg.data);
        }
      } catch (err: unknown) {
        logger.error({ err, symbol: key }, "Error parsing WebSocket message");
      }
    });

    ws.on("close", (code: number) => {
      logger.warn({ symbol: key, code }, "Binance WebSocket closed");
      this.connections.delete(key);
      this.emit("disconnected", key);

      if (this.subscriptionCounts.has(key)) {
        this.scheduleReconnect(key, useFutures);
      }
    });

    ws.on("error", (err: Error) => {
      logger.error({ err, symbol: key }, "Binance WebSocket error");
      ws.close();
    });
  }

  private disconnect(symbol: string): void {
    const timer = this.reconnectTimers.get(symbol);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(symbol);
    }

    const ws = this.connections.get(symbol);
    if (ws) {
      ws.close();
      this.connections.delete(symbol);
    }
    this.orderBooks.delete(symbol);
    this.recentTrades.delete(symbol);
    this.reconnectDelays.delete(symbol);
  }

  private scheduleReconnect(key: string, useFutures: boolean = false): void {
    const delay = this.reconnectDelays.get(key) ?? INITIAL_RECONNECT_DELAY;
    const nextDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY);
    this.reconnectDelays.set(key, nextDelay);

    logger.info({ symbol: key, delayMs: delay }, "Scheduling WebSocket reconnect");

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(key);
      if (this.subscriptionCounts.has(key)) {
        const symbol = key.startsWith("f:") ? key.slice(2) : key;
        this.connect(symbol, useFutures);
      }
    }, delay);

    this.reconnectTimers.set(key, timer);
  }

  private handleDepthUpdate(key: string, data: any): void {
    const bids: OrderBookLevel[] = (data.bids || [])
      .map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) }))
      .filter((l: OrderBookLevel) => l.quantity > 0);

    const asks: OrderBookLevel[] = (data.asks || [])
      .map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) }))
      .filter((l: OrderBookLevel) => l.quantity > 0);

    const orderBook: OrderBook = {
      bids: bids.sort((a, b) => b.price - a.price),
      asks: asks.sort((a, b) => a.price - b.price),
      lastUpdateId: data.lastUpdateId ?? Date.now(),
      timestamp: Date.now(),
    };

    this.orderBooks.set(key, orderBook);
    this.emit("orderbook", key, orderBook);
  }

  private handleTradeEvent(key: string, data: any): void {
    const trade: TradeEvent = {
      price: parseFloat(data.p),
      quantity: parseFloat(data.q),
      time: data.T,
      isBuyerMaker: data.m,
    };

    const trades = this.recentTrades.get(key) ?? [];
    trades.push(trade);
    if (trades.length > MAX_RECENT_TRADES) {
      trades.splice(0, trades.length - MAX_RECENT_TRADES);
    }
    this.recentTrades.set(key, trades);

    this.emit("trade", key, trade);
  }

  getActiveSymbols(): string[] {
    return Array.from(this.subscriptionCounts.keys());
  }

  isConnected(pair: string, useFutures: boolean = false): boolean {
    const symbol = pair.replace("/", "").toLowerCase();
    const key = useFutures ? `f:${symbol}` : symbol;
    const ws = this.connections.get(key);
    return ws?.readyState === WebSocket.OPEN;
  }

  shutdown(): void {
    for (const symbol of this.connections.keys()) {
      this.disconnect(symbol);
    }
    this.subscriptionCounts.clear();
  }
}

export const marketData = new MarketDataService();
