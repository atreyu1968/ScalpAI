import { logger } from "../lib/logger";
import { patternEngine, type OHLC } from "./patternRecognition";
import { dataProcessor } from "./dataProcessor";

const BINANCE_SPOT_APIS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
];
const BINANCE_FUTURES_APIS = [
  "https://fapi.binance.com",
];

interface BinanceKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchKlines(
  symbol: string,
  interval: "1m" | "5m",
  limit: number,
  useFutures: boolean
): Promise<BinanceKline[]> {
  const apis = useFutures ? BINANCE_FUTURES_APIS : BINANCE_SPOT_APIS;
  const endpoint = useFutures ? "/fapi/v1/klines" : "/api/v3/klines";
  const query = `?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`;

  let lastError: Error | null = null;
  for (const baseUrl of apis) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}${query}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        lastError = new Error(`${baseUrl}: ${res.status} ${res.statusText}`);
        continue;
      }
      const data: any[][] = await res.json();
      return data.map((k) => ({
        openTime: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("All Binance API endpoints failed");
}

function klinesToOHLC(klines: BinanceKline[]): OHLC[] {
  return klines.map((k) => ({
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    time: k.openTime,
  }));
}

export async function warmupSymbol(pair: string, useFutures: boolean): Promise<void> {
  const symbol = pair.replace("/", "").toLowerCase();
  const binanceSymbol = symbol.toUpperCase();
  const key = useFutures ? `f:${symbol}` : symbol;

  const existingCount = patternEngine.getCandleCount(key);
  if (existingCount.candles1m >= 50) {
    logger.info({ symbol: key, candles1m: existingCount.candles1m }, "Warmup skipped — already have enough candles");
    return;
  }

  try {
    const [klines1m, klines5m] = await Promise.all([
      fetchKlines(binanceSymbol, "1m", 120, useFutures),
      fetchKlines(binanceSymbol, "5m", 60, useFutures),
    ]);

    const candles1m = klinesToOHLC(klines1m.slice(0, -1));
    const candles5m = klinesToOHLC(klines5m.slice(0, -1));

    patternEngine.seedCandles(key, candles1m, candles5m);

    const priceHistory = candles1m.map((c) => ({
      price: (c.high + c.low + c.close) / 3,
      time: c.time,
    }));
    dataProcessor.seedPriceHistory(key, priceHistory);

    const counts = patternEngine.getCandleCount(key);
    logger.info(
      { symbol: key, candles1m: counts.candles1m, candles5m: counts.candles5m, pricePoints: priceHistory.length },
      "Warmup complete — historical data loaded from Binance"
    );
  } catch (err) {
    logger.warn({ err, symbol: key }, "Warmup failed — will rely on live data accumulation");
  }
}

export async function warmupAllActive(pairs: { pair: string; useFutures: boolean }[]): Promise<void> {
  const unique = new Map<string, boolean>();
  for (const p of pairs) {
    const key = p.pair.replace("/", "").toLowerCase();
    const fullKey = p.useFutures ? `f:${key}` : key;
    if (!unique.has(fullKey)) {
      unique.set(fullKey, p.useFutures);
    }
  }

  logger.info({ symbolCount: unique.size }, "Starting warmup for active symbols");

  for (const [key, useFutures] of unique) {
    const rawSymbol = key.startsWith("f:") ? key.slice(2) : key;
    const pair = rawSymbol.replace(/usdt$/i, "/USDT").replace(/eur$/i, "/EUR").replace(/btc$/i, "/BTC").toUpperCase();
    await warmupSymbol(pair, useFutures);
  }

  logger.info("Warmup phase complete");
}
