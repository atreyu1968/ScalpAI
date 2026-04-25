import WebSocket from "ws";
import { logger } from "../lib/logger";

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  isClosed: boolean;
}

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const BINANCE_REST = "https://api.binance.com/api/v3/klines";
const BINANCE_WS = "wss://stream.binance.com:9443/ws";
const MAX_KLINES = 500;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 60000;

class KlinesService {
  private cache = new Map<string, Kline[]>();
  private subs = new Map<string, { ws: WebSocket | null; reconnectAttempts: number; reconnectTimer: ReturnType<typeof setTimeout> | null }>();
  private listeners = new Map<string, Set<(k: Kline) => void>>();

  private key(symbol: string, interval: Interval): string {
    return `${symbol.toLowerCase()}@${interval}`;
  }

  async loadInitial(symbol: string, interval: Interval, limit = 300): Promise<Kline[]> {
    const cleanSymbol = symbol.replace("/", "").toUpperCase();
    const url = `${BINANCE_REST}?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const raw = (await res.json()) as unknown[][];
      const klines: Kline[] = raw.map((r) => ({
        openTime: r[0] as number,
        open: parseFloat(r[1] as string),
        high: parseFloat(r[2] as string),
        low: parseFloat(r[3] as string),
        close: parseFloat(r[4] as string),
        volume: parseFloat(r[5] as string),
        closeTime: r[6] as number,
        isClosed: true,
      }));
      this.cache.set(this.key(symbol, interval), klines);
      logger.info({ symbol, interval, count: klines.length }, "Klines initial load complete");
      return klines;
    } catch (err) {
      logger.error({ err, symbol, interval }, "Failed to load initial klines");
      throw err;
    }
  }

  subscribe(symbol: string, interval: Interval, listener: (k: Kline) => void): () => void {
    const key = this.key(symbol, interval);
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);

    if (!this.subs.has(key)) {
      this.connect(symbol, interval);
    }

    return () => {
      const s = this.listeners.get(key);
      if (s) {
        s.delete(listener);
        if (s.size === 0) {
          this.disconnect(symbol, interval);
        }
      }
    };
  }

  private connect(symbol: string, interval: Interval): void {
    const key = this.key(symbol, interval);
    const cleanSymbol = symbol.replace("/", "").toLowerCase();
    const stream = `${cleanSymbol}@kline_${interval}`;
    const url = `${BINANCE_WS}/${stream}`;

    const sub = this.subs.get(key) ?? { ws: null, reconnectAttempts: 0, reconnectTimer: null };
    this.subs.set(key, sub);

    try {
      const ws = new WebSocket(url);
      sub.ws = ws;

      ws.on("open", () => {
        sub.reconnectAttempts = 0;
        logger.info({ symbol, interval }, "Klines WS connected");
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          const k = msg.k;
          if (!k) return;
          const kline: Kline = {
            openTime: k.t,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            closeTime: k.T,
            isClosed: !!k.x,
          };
          this.applyKline(symbol, interval, kline);
          const set = this.listeners.get(key);
          if (set) {
            for (const fn of set) {
              try { fn(kline); } catch (e) { logger.error({ err: e }, "Klines listener error"); }
            }
          }
        } catch (err) {
          logger.error({ err, symbol, interval }, "Klines WS message parse error");
        }
      });

      ws.on("close", () => {
        if (this.subs.has(key) && this.listeners.get(key)?.size) {
          this.scheduleReconnect(symbol, interval);
        }
      });

      ws.on("error", (err) => {
        logger.warn({ err: String(err), symbol, interval }, "Klines WS error");
      });
    } catch (err) {
      logger.error({ err, symbol, interval }, "Failed to open klines WS");
      this.scheduleReconnect(symbol, interval);
    }
  }

  private scheduleReconnect(symbol: string, interval: Interval): void {
    const key = this.key(symbol, interval);
    const sub = this.subs.get(key);
    if (!sub) return;
    if (sub.reconnectTimer) return;
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, sub.reconnectAttempts));
    sub.reconnectAttempts += 1;
    sub.reconnectTimer = setTimeout(() => {
      sub.reconnectTimer = null;
      if (this.listeners.get(key)?.size) {
        this.connect(symbol, interval);
      }
    }, delay);
  }

  private disconnect(symbol: string, interval: Interval): void {
    const key = this.key(symbol, interval);
    const sub = this.subs.get(key);
    if (!sub) return;
    if (sub.reconnectTimer) clearTimeout(sub.reconnectTimer);
    if (sub.ws) {
      try { sub.ws.close(); } catch {}
    }
    this.subs.delete(key);
    this.listeners.delete(key);
  }

  private applyKline(symbol: string, interval: Interval, kline: Kline): void {
    const key = this.key(symbol, interval);
    const arr = this.cache.get(key);
    if (!arr) {
      this.cache.set(key, [kline]);
      return;
    }
    const last = arr[arr.length - 1];
    if (last && last.openTime === kline.openTime) {
      arr[arr.length - 1] = kline;
    } else if (!last || kline.openTime > last.openTime) {
      arr.push(kline);
      if (arr.length > MAX_KLINES) arr.splice(0, arr.length - MAX_KLINES);
    }
  }

  getKlines(symbol: string, interval: Interval): Kline[] | null {
    return this.cache.get(this.key(symbol, interval)) ?? null;
  }

  getClosedKlines(symbol: string, interval: Interval): Kline[] | null {
    const arr = this.cache.get(this.key(symbol, interval));
    if (!arr) return null;
    return arr.filter((k) => k.isClosed);
  }

  shutdown(): void {
    for (const [key, sub] of this.subs.entries()) {
      if (sub.reconnectTimer) clearTimeout(sub.reconnectTimer);
      if (sub.ws) { try { sub.ws.close(); } catch {} }
      this.subs.delete(key);
    }
    this.listeners.clear();
  }
}

export const klinesService = new KlinesService();

export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  if (closes.length < period + 1) return [];
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const out: number[] = new Array(closes.length).fill(NaN);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atr(klines: Kline[], period = 14): number[] {
  if (klines.length < 2) return [];
  const tr: number[] = [0];
  for (let i = 1; i < klines.length; i++) {
    const k = klines[i];
    const prev = klines[i - 1];
    const a = k.high - k.low;
    const b = Math.abs(k.high - prev.close);
    const c = Math.abs(k.low - prev.close);
    tr.push(Math.max(a, b, c));
  }
  const out: number[] = new Array(klines.length).fill(NaN);
  if (klines.length < period + 1) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  out[period] = sum / period;
  for (let i = period + 1; i < klines.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}
