export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface CandlePattern {
  name: string;
  direction: "bullish" | "bearish" | "neutral";
  strength: number;
}

export interface TrendAnalysis {
  direction: "up" | "down" | "sideways";
  strength: number;
  ema9: number;
  ema21: number;
  ema50: number;
  emaAlignment: "bullish" | "bearish" | "mixed";
}

export interface SupportResistance {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export interface MarketRegime {
  type: "trending" | "ranging" | "volatile";
  adx: number;
  description: string;
}

export interface PatternAnalysis {
  candles1m: OHLC[];
  candles5m: OHLC[];
  patterns1m: CandlePattern[];
  patterns5m: CandlePattern[];
  trend: TrendAnalysis;
  supportResistance: SupportResistance;
  regime: MarketRegime;
  macd: { line: number; signal: number; histogram: number } | null;
  bollingerPosition: number | null;
}

interface TickData {
  price: number;
  volume: number;
  time: number;
  isBuy: boolean;
}

const CANDLE_1M_MS = 60_000;
const CANDLE_5M_MS = 300_000;
const MAX_CANDLES_1M = 120;
const MAX_CANDLES_5M = 60;

class PatternRecognitionEngine {
  private ticks: Map<string, TickData[]> = new Map();
  private candles1m: Map<string, OHLC[]> = new Map();
  private candles5m: Map<string, OHLC[]> = new Map();
  private currentCandle1m: Map<string, OHLC> = new Map();
  private currentCandle5m: Map<string, OHLC> = new Map();

  addTick(symbol: string, price: number, volume: number, isBuy: boolean): void {
    const now = Date.now();
    const tick: TickData = { price, volume, time: now, isBuy };

    const ticks = this.ticks.get(symbol) ?? [];
    ticks.push(tick);
    if (ticks.length > 5000) ticks.splice(0, ticks.length - 5000);
    this.ticks.set(symbol, ticks);

    this.updateCandle(symbol, price, volume, now, CANDLE_1M_MS, this.currentCandle1m, this.candles1m, MAX_CANDLES_1M);
    this.updateCandle(symbol, price, volume, now, CANDLE_5M_MS, this.currentCandle5m, this.candles5m, MAX_CANDLES_5M);
  }

  private updateCandle(
    symbol: string,
    price: number,
    volume: number,
    now: number,
    intervalMs: number,
    currentMap: Map<string, OHLC>,
    candlesMap: Map<string, OHLC[]>,
    maxCandles: number,
  ): void {
    const candleStart = Math.floor(now / intervalMs) * intervalMs;
    const current = currentMap.get(symbol);

    if (!current || current.time !== candleStart) {
      if (current) {
        const candles = candlesMap.get(symbol) ?? [];
        candles.push({ ...current });
        if (candles.length > maxCandles) candles.splice(0, candles.length - maxCandles);
        candlesMap.set(symbol, candles);
      }
      currentMap.set(symbol, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
        time: candleStart,
      });
    } else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.volume += volume;
    }
  }

  analyze(symbol: string): PatternAnalysis | null {
    const c1m = this.candles1m.get(symbol) ?? [];
    const c5m = this.candles5m.get(symbol) ?? [];

    if (c1m.length < 50) return null;

    const patterns1m = this.detectPatterns(c1m);
    const patterns5m = c5m.length >= 5 ? this.detectPatterns(c5m) : [];
    const trend = this.analyzeTrend(c1m);
    const supportResistance = this.findSupportResistance(c1m, c5m);
    const regime = this.detectRegime(c1m);
    const macd = this.computeMACD(c1m);
    const bollingerPosition = this.computeBollingerPosition(c1m);

    return {
      candles1m: c1m.slice(-5),
      candles5m: c5m.slice(-3),
      patterns1m,
      patterns5m,
      trend,
      supportResistance,
      regime,
      macd,
      bollingerPosition,
    };
  }

  private detectPatterns(candles: OHLC[]): CandlePattern[] {
    const patterns: CandlePattern[] = [];
    if (candles.length < 3) return patterns;

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];

    const body = Math.abs(last.close - last.open);
    const range = last.high - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;

    if (range > 0 && body / range < 0.1) {
      patterns.push({ name: "Doji", direction: "neutral", strength: 60 });
    }

    const priorTrend = candles.length >= 5
      ? (candles[candles.length - 5].close - candles[candles.length - 2].close) / candles[candles.length - 5].close * 100
      : 0;

    if (range > 0 && lowerWick > body * 2 && upperWick < body * 0.5 && priorTrend < -0.05) {
      patterns.push({ name: "Hammer", direction: "bullish", strength: 70 });
    }

    if (range > 0 && upperWick > body * 2 && lowerWick < body * 0.5 && priorTrend > 0.05) {
      patterns.push({ name: "Shooting Star", direction: "bearish", strength: 70 });
    }

    const prevBody = Math.abs(prev.close - prev.open);
    if (
      body > 0 && prevBody > 0 &&
      prev.close < prev.open &&
      last.close > last.open &&
      last.open <= prev.close &&
      last.close >= prev.open &&
      body > prevBody * 0.8
    ) {
      patterns.push({ name: "Bullish Engulfing", direction: "bullish", strength: 80 });
    }

    if (
      body > 0 && prevBody > 0 &&
      prev.close > prev.open &&
      last.close < last.open &&
      last.open >= prev.close &&
      last.close <= prev.open &&
      body > prevBody * 0.8
    ) {
      patterns.push({ name: "Bearish Engulfing", direction: "bearish", strength: 80 });
    }

    if (candles.length >= 3) {
      const prev2Body = Math.abs(prev2.close - prev2.open);
      if (
        prev2.close < prev2.open && prev2Body > 0 &&
        Math.abs(prev.close - prev.open) < prev2Body * 0.3 &&
        last.close > last.open &&
        last.close > (prev2.open + prev2.close) / 2
      ) {
        patterns.push({ name: "Morning Star", direction: "bullish", strength: 85 });
      }

      if (
        prev2.close > prev2.open && prev2Body > 0 &&
        Math.abs(prev.close - prev.open) < prev2Body * 0.3 &&
        last.close < last.open &&
        last.close < (prev2.open + prev2.close) / 2
      ) {
        patterns.push({ name: "Evening Star", direction: "bearish", strength: 85 });
      }
    }

    if (candles.length >= 3) {
      if (
        prev2.close > prev2.open &&
        prev.close > prev.open &&
        last.close > last.open &&
        prev.close > prev2.close &&
        last.close > prev.close
      ) {
        patterns.push({ name: "Three White Soldiers", direction: "bullish", strength: 85 });
      }

      if (
        prev2.close < prev2.open &&
        prev.close < prev.open &&
        last.close < last.open &&
        prev.close < prev2.close &&
        last.close < prev.close
      ) {
        patterns.push({ name: "Three Black Crows", direction: "bearish", strength: 85 });
      }
    }

    if (range > 0) {
      const pinWickRatio = 0.6;
      if (lowerWick / range > pinWickRatio && body / range < 0.25) {
        patterns.push({ name: "Bullish Pin Bar", direction: "bullish", strength: 75 });
      }
      if (upperWick / range > pinWickRatio && body / range < 0.25) {
        patterns.push({ name: "Bearish Pin Bar", direction: "bearish", strength: 75 });
      }
    }

    return patterns;
  }

  private ema(data: number[], period: number): number[] {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  private analyzeTrend(candles: OHLC[]): TrendAnalysis {
    const closes = candles.map((c) => c.close);

    const ema9Arr = this.ema(closes, 9);
    const ema21Arr = this.ema(closes, 21);
    const ema50Arr = this.ema(closes, 50);

    const ema9 = ema9Arr[ema9Arr.length - 1] || 0;
    const ema21 = ema21Arr[ema21Arr.length - 1] || 0;
    const ema50 = ema50Arr[ema50Arr.length - 1] || 0;

    let emaAlignment: "bullish" | "bearish" | "mixed" = "mixed";
    if (ema9 > ema21 && ema21 > ema50) emaAlignment = "bullish";
    else if (ema9 < ema21 && ema21 < ema50) emaAlignment = "bearish";

    const recent = closes.slice(-10);
    let upMoves = 0;
    let downMoves = 0;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) upMoves++;
      else if (recent[i] < recent[i - 1]) downMoves++;
    }

    const ema9Slope = ema9Arr.length >= 5 ? (ema9Arr[ema9Arr.length - 1] - ema9Arr[ema9Arr.length - 5]) / ema9Arr[ema9Arr.length - 5] * 100 : 0;

    let direction: "up" | "down" | "sideways" = "sideways";
    let strength = 0;

    if (emaAlignment === "bullish" && upMoves > downMoves) {
      direction = "up";
      strength = Math.min(100, (upMoves / (upMoves + downMoves)) * 100 * (1 + Math.abs(ema9Slope)));
    } else if (emaAlignment === "bearish" && downMoves > upMoves) {
      direction = "down";
      strength = Math.min(100, (downMoves / (upMoves + downMoves)) * 100 * (1 + Math.abs(ema9Slope)));
    } else {
      strength = Math.abs(upMoves - downMoves) / Math.max(1, upMoves + downMoves) * 50;
    }

    return { direction, strength, ema9, ema21, ema50, emaAlignment };
  }

  private findSupportResistance(candles1m: OHLC[], candles5m: OHLC[]): SupportResistance {
    if (candles1m.length < 5) {
      return { supports: [], resistances: [], nearestSupport: null, nearestResistance: null };
    }

    const pivotPrices: number[] = [];

    const findPivots = (candles: OHLC[]) => {
      for (let i = 2; i < candles.length - 2; i++) {
        const c = candles[i];
        if (
          c.high > candles[i - 1].high &&
          c.high > candles[i - 2].high &&
          c.high > candles[i + 1].high &&
          c.high > candles[i + 2].high
        ) {
          pivotPrices.push(c.high);
        }
        if (
          c.low < candles[i - 1].low &&
          c.low < candles[i - 2].low &&
          c.low < candles[i + 1].low &&
          c.low < candles[i + 2].low
        ) {
          pivotPrices.push(c.low);
        }
      }
    };

    findPivots(candles1m);
    if (candles5m.length >= 5) findPivots(candles5m);

    const currentPrice = candles1m[candles1m.length - 1].close;
    const clusterThreshold = currentPrice * 0.001;

    const clustered = this.clusterLevels(pivotPrices, clusterThreshold);

    const supports = clustered.filter((p) => p < currentPrice).sort((a, b) => b - a).slice(0, 3);
    const resistances = clustered.filter((p) => p > currentPrice).sort((a, b) => a - b).slice(0, 3);

    return {
      supports,
      resistances,
      nearestSupport: supports[0] ?? null,
      nearestResistance: resistances[0] ?? null,
    };
  }

  private clusterLevels(prices: number[], threshold: number): number[] {
    if (prices.length === 0) return [];
    const sorted = [...prices].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const avg = lastCluster.reduce((s, v) => s + v, 0) / lastCluster.length;
      if (Math.abs(sorted[i] - avg) < threshold) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }

    return clusters
      .filter((c) => c.length >= 2)
      .map((c) => c.reduce((s, v) => s + v, 0) / c.length);
  }

  private detectRegime(candles: OHLC[]): MarketRegime {
    if (candles.length < 14) {
      return { type: "ranging", adx: 0, description: "Datos insuficientes" };
    }

    const adx = this.computeADX(candles, 14);

    if (adx > 25) {
      return { type: "trending", adx, description: `Tendencia fuerte (ADX=${adx.toFixed(1)})` };
    } else if (adx > 20) {
      return { type: "trending", adx, description: `Tendencia moderada (ADX=${adx.toFixed(1)})` };
    }

    const recent = candles.slice(-20);
    const highs = recent.map((c) => c.high);
    const lows = recent.map((c) => c.low);
    const avgRange = highs.reduce((s, h, i) => s + (h - lows[i]), 0) / recent.length;
    const priceRange = Math.max(...highs) - Math.min(...lows);
    const avgPrice = recent.reduce((s, c) => s + c.close, 0) / recent.length;
    const rangeRatio = priceRange / avgPrice * 100;

    if (rangeRatio > 1.5) {
      return { type: "volatile", adx, description: `Alta volatilidad sin tendencia (ADX=${adx.toFixed(1)}, rango=${rangeRatio.toFixed(2)}%)` };
    }

    return { type: "ranging", adx, description: `Mercado lateral (ADX=${adx.toFixed(1)})` };
  }

  private computeADX(candles: OHLC[], period: number): number {
    if (candles.length < period + 1) return 0;

    const trueRanges: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const prevHigh = candles[i - 1].high;
      const prevLow = candles[i - 1].low;

      trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));

      const upMove = high - prevHigh;
      const downMove = prevLow - low;

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    const smoothTR = this.wilderSmooth(trueRanges, period);
    const smoothPlusDM = this.wilderSmooth(plusDM, period);
    const smoothMinusDM = this.wilderSmooth(minusDM, period);

    const dx: number[] = [];
    for (let i = 0; i < smoothTR.length; i++) {
      if (smoothTR[i] === 0) { dx.push(0); continue; }
      const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
      const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
      const diSum = plusDI + minusDI;
      dx.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
    }

    if (dx.length < period) return dx.length > 0 ? dx[dx.length - 1] : 0;

    const adxSmooth = this.wilderSmooth(dx, period);
    return adxSmooth[adxSmooth.length - 1] || 0;
  }

  private wilderSmooth(data: number[], period: number): number[] {
    if (data.length < period) return data.length > 0 ? [data.reduce((s, v) => s + v, 0) / data.length] : [];
    const result: number[] = [];
    let first = 0;
    for (let i = 0; i < period; i++) first += data[i];
    result.push(first / period);
    for (let i = period; i < data.length; i++) {
      result.push((result[result.length - 1] * (period - 1) + data[i]) / period);
    }
    return result;
  }

  private computeMACD(candles: OHLC[]): { line: number; signal: number; histogram: number } | null {
    if (candles.length < 26) return null;
    const closes = candles.map((c) => c.close);
    const ema12 = this.ema(closes, 12);
    const ema26 = this.ema(closes, 26);

    const macdLine: number[] = [];
    for (let i = 0; i < ema12.length; i++) {
      macdLine.push(ema12[i] - (ema26[i] || 0));
    }

    const signalLine = this.ema(macdLine, 9);
    const line = macdLine[macdLine.length - 1];
    const signal = signalLine[signalLine.length - 1];

    return { line, signal, histogram: line - signal };
  }

  private computeBollingerPosition(candles: OHLC[]): number | null {
    if (candles.length < 20) return null;
    const closes = candles.slice(-20).map((c) => c.close);
    const mean = closes.reduce((s, v) => s + v, 0) / closes.length;
    const variance = closes.reduce((s, v) => s + (v - mean) ** 2, 0) / closes.length;
    const std = Math.sqrt(variance);
    if (std === 0) return 0.5;

    const upper = mean + 2 * std;
    const lower = mean - 2 * std;
    const current = closes[closes.length - 1];

    return (current - lower) / (upper - lower);
  }

  seedCandles(symbol: string, candles1m: OHLC[], candles5m: OHLC[]): void {
    if (candles1m.length > 0) {
      this.candles1m.set(symbol, candles1m.slice(-MAX_CANDLES_1M));
      const last1m = candles1m[candles1m.length - 1];
      this.currentCandle1m.set(symbol, { ...last1m });
    }
    if (candles5m.length > 0) {
      this.candles5m.set(symbol, candles5m.slice(-MAX_CANDLES_5M));
      const last5m = candles5m[candles5m.length - 1];
      this.currentCandle5m.set(symbol, { ...last5m });
    }
  }

  getCandleCount(symbol: string): { candles1m: number; candles5m: number } {
    return {
      candles1m: (this.candles1m.get(symbol) ?? []).length,
      candles5m: (this.candles5m.get(symbol) ?? []).length,
    };
  }

  getCandleHistory(symbol: string, timeframe: "1m" | "5m"): OHLC[] {
    const map = timeframe === "1m" ? this.candles1m : this.candles5m;
    const current = timeframe === "1m" ? this.currentCandle1m : this.currentCandle5m;
    const candles = [...(map.get(symbol) ?? [])];
    const live = current.get(symbol);
    if (live) candles.push(live);
    return candles;
  }
}

export const patternEngine = new PatternRecognitionEngine();
