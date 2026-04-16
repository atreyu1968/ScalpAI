import { marketData, type OrderBook, type TradeEvent } from "./marketData";
import { patternEngine, type PatternAnalysis } from "./patternRecognition";
import { logger } from "../lib/logger";

export interface MarketSnapshot {
  pair: string;
  timestamp: number;
  orderBook: {
    bestBid: number;
    bestAsk: number;
    spread: number;
    spreadBps: number;
    bidDepth: number;
    askDepth: number;
    volumeImbalance: number;
    topBids: { price: number; quantity: number }[];
    topAsks: { price: number; quantity: number }[];
  };
  recentTrades: {
    count: number;
    avgPrice: number;
    buyVolume: number;
    sellVolume: number;
    buyRatio: number;
    vwap: number;
  };
  indicators: {
    rsi: number | null;
    priceChange1m: number | null;
    volatility: number | null;
  };
  patterns: PatternAnalysis | null;
}

const RSI_PERIOD = 14;
const PRICE_HISTORY_MAX = 120;

class DataProcessor {
  private priceHistory: Map<string, { price: number; time: number }[]> = new Map();
  private tradeListenerAttached = false;

  init(): void {
    if (this.tradeListenerAttached) return;
    this.tradeListenerAttached = true;
    marketData.on("trade", (key: string, trade: TradeEvent) => {
      patternEngine.addTick(key, trade.price, trade.quantity, !trade.isBuyerMaker);
    });
  }

  buildSnapshot(pair: string, useFutures: boolean): MarketSnapshot | null {
    const symbol = pair.replace("/", "").toLowerCase();
    const obKey = useFutures ? `f:${symbol}` : symbol;

    const ob = marketData.getOrderBook(obKey);
    if (!ob || ob.bids.length === 0 || ob.asks.length === 0) {
      return null;
    }

    const trades = marketData.getRecentTrades(obKey, 100);

    const bestBid = ob.bids[0].price;
    const bestAsk = ob.asks[0].price;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;
    const spreadBps = (spread / midPrice) * 10000;

    const bidDepth = ob.bids.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const askDepth = ob.asks.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const totalDepth = bidDepth + askDepth;
    const volumeImbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;

    const topBids = ob.bids.slice(0, 5).map((l) => ({ price: l.price, quantity: l.quantity }));
    const topAsks = ob.asks.slice(0, 5).map((l) => ({ price: l.price, quantity: l.quantity }));

    const tradeStats = this.computeTradeStats(trades);

    this.recordPrice(obKey, midPrice);
    const indicators = this.computeIndicators(obKey);
    const patterns = patternEngine.analyze(obKey);

    return {
      pair,
      timestamp: Date.now(),
      orderBook: {
        bestBid,
        bestAsk,
        spread,
        spreadBps,
        bidDepth,
        askDepth,
        volumeImbalance,
        topBids,
        topAsks,
      },
      recentTrades: tradeStats,
      indicators,
      patterns,
    };
  }

  seedPriceHistory(key: string, prices: { price: number; time: number }[]): void {
    const history = prices.slice(-PRICE_HISTORY_MAX);
    this.priceHistory.set(key, history);
  }

  private computeTradeStats(trades: TradeEvent[]): MarketSnapshot["recentTrades"] {
    if (trades.length === 0) {
      return { count: 0, avgPrice: 0, buyVolume: 0, sellVolume: 0, buyRatio: 0.5, vwap: 0 };
    }

    let totalVolume = 0;
    let totalValue = 0;
    let buyVolume = 0;
    let sellVolume = 0;
    let priceSum = 0;

    for (const t of trades) {
      const value = t.price * t.quantity;
      totalVolume += t.quantity;
      totalValue += value;
      priceSum += t.price;
      if (t.isBuyerMaker) {
        sellVolume += t.quantity;
      } else {
        buyVolume += t.quantity;
      }
    }

    return {
      count: trades.length,
      avgPrice: priceSum / trades.length,
      buyVolume,
      sellVolume,
      buyRatio: totalVolume > 0 ? buyVolume / totalVolume : 0.5,
      vwap: totalVolume > 0 ? totalValue / totalVolume : 0,
    };
  }

  private recordPrice(key: string, price: number): void {
    const history = this.priceHistory.get(key) ?? [];
    history.push({ price, time: Date.now() });
    if (history.length > PRICE_HISTORY_MAX) {
      history.splice(0, history.length - PRICE_HISTORY_MAX);
    }
    this.priceHistory.set(key, history);
  }

  getVolatility(pair: string, useFutures: boolean = false): number | null {
    const symbol = pair.replace("/", "").toLowerCase();
    const key = useFutures ? `f:${symbol}` : symbol;
    const history = this.priceHistory.get(key) ?? [];
    if (history.length < 10) return null;
    const recent = history.slice(-20);
    const prices = recent.map((h) => h.price);
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
    return (Math.sqrt(variance) / mean) * 100;
  }

  private computeIndicators(key: string): MarketSnapshot["indicators"] {
    const history = this.priceHistory.get(key) ?? [];

    let rsi: number | null = null;
    if (history.length >= RSI_PERIOD + 1) {
      const changes: number[] = [];
      for (let i = history.length - RSI_PERIOD; i < history.length; i++) {
        changes.push(history[i].price - history[i - 1].price);
      }
      let avgGain = 0;
      let avgLoss = 0;
      for (const c of changes) {
        if (c > 0) avgGain += c;
        else avgLoss += Math.abs(c);
      }
      avgGain /= RSI_PERIOD;
      avgLoss /= RSI_PERIOD;
      if (avgLoss === 0) {
        rsi = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi = 100 - 100 / (1 + rs);
      }
    }

    let priceChange1m: number | null = null;
    const now = Date.now();
    const oneMinAgo = history.find((h) => h.time >= now - 60000);
    if (oneMinAgo && history.length > 0) {
      const current = history[history.length - 1].price;
      priceChange1m = ((current - oneMinAgo.price) / oneMinAgo.price) * 100;
    }

    let volatility: number | null = null;
    if (history.length >= 10) {
      const recent = history.slice(-20);
      const prices = recent.map((h) => h.price);
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
      volatility = (Math.sqrt(variance) / mean) * 100;
    }

    return { rsi, priceChange1m, volatility };
  }
}

export const dataProcessor = new DataProcessor();
