import { logger } from "../lib/logger";

const BINANCE_SPOT_APIS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
];
const BINANCE_FUTURES_APIS = ["https://fapi.binance.com"];

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const EMA_PERIOD = 50;
const FETCH_LIMIT = 100;

export type HigherTimeframeBias = "bullish" | "bearish" | "neutral";

interface BiasData {
  bias: HigherTimeframeBias;
  closePrice: number;
  ema50: number;
  fetchedAt: number;
}

class HigherTimeframeService {
  private cache: Map<string, BiasData> = new Map();
  private inFlight: Map<string, Promise<BiasData | null>> = new Map();

  private getKey(pair: string, useFutures: boolean): string {
    const symbol = pair.replace("/", "").toLowerCase();
    return useFutures ? `f:${symbol}` : symbol;
  }

  private async fetchKlines1H(binanceSymbol: string, useFutures: boolean): Promise<number[] | null> {
    const apis = useFutures ? BINANCE_FUTURES_APIS : BINANCE_SPOT_APIS;
    const endpoint = useFutures ? "/fapi/v1/klines" : "/api/v3/klines";
    const query = `?symbol=${binanceSymbol.toUpperCase()}&interval=1h&limit=${FETCH_LIMIT}`;

    for (const baseUrl of apis) {
      try {
        const res = await fetch(`${baseUrl}${endpoint}${query}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) continue;
        const data = (await res.json()) as unknown[][];
        const closes = data.slice(0, -1).map((k) => parseFloat(String(k[4])));
        if (closes.length >= EMA_PERIOD) return closes;
      } catch {
      }
    }
    return null;
  }

  private computeEMA(values: number[], period: number): number | null {
    if (values.length < period) return null;
    const k = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) {
      ema = values[i] * k + ema * (1 - k);
    }
    return ema;
  }

  private async refresh(pair: string, useFutures: boolean): Promise<BiasData | null> {
    const symbol = pair.replace("/", "").toUpperCase();
    const closes = await this.fetchKlines1H(symbol, useFutures);
    if (!closes) return null;

    const ema50 = this.computeEMA(closes, EMA_PERIOD);
    if (ema50 === null) return null;

    const closePrice = closes[closes.length - 1];
    const diffPct = ((closePrice - ema50) / ema50) * 100;

    let bias: HigherTimeframeBias;
    if (diffPct > 0.1) {
      bias = "bullish";
    } else if (diffPct < -0.1) {
      bias = "bearish";
    } else {
      bias = "neutral";
    }

    const data: BiasData = { bias, closePrice, ema50, fetchedAt: Date.now() };
    const key = this.getKey(pair, useFutures);
    this.cache.set(key, data);

    logger.debug(
      { pair, useFutures, bias, closePrice, ema50: ema50.toFixed(2), diffPct: diffPct.toFixed(3) },
      "1H bias refreshed",
    );

    return data;
  }

  async getBias(pair: string, useFutures: boolean): Promise<BiasData | null> {
    const key = this.getKey(pair, useFutures);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.fetchedAt < REFRESH_INTERVAL_MS) {
      return cached;
    }

    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.refresh(pair, useFutures).finally(() => {
        this.inFlight.delete(key);
      });
      this.inFlight.set(key, pending);
    }

    const fresh = await pending;
    if (fresh) return fresh;
    return cached ?? null;
  }
}

export const higherTimeframe = new HigherTimeframeService();
