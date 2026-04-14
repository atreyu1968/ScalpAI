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

  getOrderBook(symbol: string): OrderBook | undefined {
    return this.orderBooks.get(symbol.toLowerCase());
  }

  getBestBid(symbol: string): number | undefined {
    const ob = this.getOrderBook(symbol);
    return ob && ob.bids.length > 0 ? ob.bids[0].price : undefined;
  }

  getRecentTrades(symbol: string, limit: number = 50): TradeEvent[] {
    const trades = this.recentTrades.get(symbol.toLowerCase()) ?? [];
    return trades.slice(-limit);
  }

  getBestAsk(symbol: string): number | undefined {
    const ob = this.getOrderBook(symbol);
    return ob && ob.asks.length > 0 ? ob.asks[0].price : undefined;
  }

  subscribe(pair: string): void {
    const symbol = pair.replace("/", "").toLowerCase();
    const count = this.subscriptionCounts.get(symbol) ?? 0;
    this.subscriptionCounts.set(symbol, count + 1);

    if (count === 0) {
      this.connect(symbol);
    }
  }

  unsubscribe(pair: string): void {
    const symbol = pair.replace("/", "").toLowerCase();
    const count = this.subscriptionCounts.get(symbol) ?? 0;
    if (count <= 1) {
      this.subscriptionCounts.delete(symbol);
      this.disconnect(symbol);
    } else {
      this.subscriptionCounts.set(symbol, count - 1);
    }
  }

  private connect(symbol: string): void {
    if (this.connections.has(symbol)) return;

    const streams = `${symbol}@depth${ORDERBOOK_DEPTH}@100ms/${symbol}@trade`;
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    logger.info({ symbol, url }, "Connecting to Binance WebSocket");

    const ws = new WebSocket(url);
    this.connections.set(symbol, ws);

    ws.on("open", () => {
      logger.info({ symbol }, "Binance WebSocket connected");
      this.reconnectDelays.set(symbol, INITIAL_RECONNECT_DELAY);
      this.emit("connected", symbol);
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!msg.stream || !msg.data) return;

        if (msg.stream.includes("@depth")) {
          this.handleDepthUpdate(symbol, msg.data);
        } else if (msg.stream.includes("@trade")) {
          this.handleTradeEvent(symbol, msg.data);
        }
      } catch (err) {
        logger.error({ err, symbol }, "Error parsing WebSocket message");
      }
    });

    ws.on("close", (code: number) => {
      logger.warn({ symbol, code }, "Binance WebSocket closed");
      this.connections.delete(symbol);
      this.emit("disconnected", symbol);

      if (this.subscriptionCounts.has(symbol)) {
        this.scheduleReconnect(symbol);
      }
    });

    ws.on("error", (err: Error) => {
      logger.error({ err, symbol }, "Binance WebSocket error");
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

  private scheduleReconnect(symbol: string): void {
    const delay = this.reconnectDelays.get(symbol) ?? INITIAL_RECONNECT_DELAY;
    const nextDelay = Math.min(delay * 2, MAX_RECONNECT_DELAY);
    this.reconnectDelays.set(symbol, nextDelay);

    logger.info({ symbol, delayMs: delay }, "Scheduling WebSocket reconnect");

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(symbol);
      if (this.subscriptionCounts.has(symbol)) {
        this.connect(symbol);
      }
    }, delay);

    this.reconnectTimers.set(symbol, timer);
  }

  private handleDepthUpdate(symbol: string, data: any): void {
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

    this.orderBooks.set(symbol, orderBook);
    this.emit("orderbook", symbol, orderBook);
  }

  private handleTradeEvent(symbol: string, data: any): void {
    const trade: TradeEvent = {
      price: parseFloat(data.p),
      quantity: parseFloat(data.q),
      time: data.T,
      isBuyerMaker: data.m,
    };

    const trades = this.recentTrades.get(symbol) ?? [];
    trades.push(trade);
    if (trades.length > MAX_RECENT_TRADES) {
      trades.splice(0, trades.length - MAX_RECENT_TRADES);
    }
    this.recentTrades.set(symbol, trades);

    this.emit("trade", symbol, trade);
  }

  getActiveSymbols(): string[] {
    return Array.from(this.subscriptionCounts.keys());
  }

  isConnected(symbol: string): boolean {
    const ws = this.connections.get(symbol.replace("/", "").toLowerCase());
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
