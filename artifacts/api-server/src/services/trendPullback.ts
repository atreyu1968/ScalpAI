import { type Bot } from "@workspace/db";
import { klinesService, ema, rsi, atr, type Kline } from "./klines";
import { marketData } from "./marketData";
import { logger } from "../lib/logger";
import type { TradeSignal } from "./botManager";

export interface TrendPullbackParams {
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  atrPeriod: number;
  atrStopMultiplier: number;
  riskPerTrade: number;
  minimumStopDistance: number;
  minimumNetExpectedProfit: number;
  minimumRiskRewardNet: number;
  maximumSpread: number;
  estimatedFees: number;
  rsiMin: number;
  rsiMax: number;
  pullbackProximity: number;
}

export const DEFAULT_TREND_PULLBACK: TrendPullbackParams = {
  emaFast: 50,
  emaSlow: 200,
  rsiPeriod: 14,
  atrPeriod: 14,
  atrStopMultiplier: 1.5,
  riskPerTrade: 0.005,
  minimumStopDistance: 0.008,
  minimumNetExpectedProfit: 0.01,
  minimumRiskRewardNet: 1.5,
  maximumSpread: 0.0005,
  estimatedFees: 0.0025,
  rsiMin: 40,
  rsiMax: 60,
  pullbackProximity: 0.005,
};

export const SUPPORTED_PAIRS = ["BTC/USDT", "ETH/USDT"];

export interface TrendPullbackDecision {
  signal: TradeSignal | null;
  reason: string;
  details: Record<string, unknown>;
}

const lastDecisions = new Map<number, TrendPullbackDecision>();
const initializedSymbols = new Set<string>();

function getParams(bot: Bot): TrendPullbackParams {
  const stored = (bot.strategyParams ?? {}) as Partial<TrendPullbackParams>;
  return { ...DEFAULT_TREND_PULLBACK, ...stored };
}

async function ensureKlinesLoaded(symbol: string): Promise<void> {
  if (initializedSymbols.has(symbol)) return;
  initializedSymbols.add(symbol);
  try {
    await klinesService.loadInitial(symbol, "1h", 300);
    await klinesService.loadInitial(symbol, "4h", 300);
    klinesService.subscribe(symbol, "1h", () => {});
    klinesService.subscribe(symbol, "4h", () => {});
  } catch (err) {
    initializedSymbols.delete(symbol);
    logger.error({ err, symbol }, "Failed to bootstrap klines for trend pullback");
  }
}

export async function generateTrendPullbackSignal(bot: Bot): Promise<TradeSignal | null> {
  const decision = await evaluate(bot);
  lastDecisions.set(bot.id, decision);
  if (!decision.signal) {
    logger.debug({ botId: bot.id, reason: decision.reason, details: decision.details }, "TrendPullback: no signal");
  }
  return decision.signal;
}

export function getLastDecision(botId: number): TrendPullbackDecision | undefined {
  return lastDecisions.get(botId);
}

async function evaluate(bot: Bot): Promise<TrendPullbackDecision> {
  const params = getParams(bot);
  const symbol = bot.pair.toUpperCase();

  if (!SUPPORTED_PAIRS.includes(symbol)) {
    return { signal: null, reason: "pair_not_supported", details: { pair: symbol, supported: SUPPORTED_PAIRS } };
  }

  await ensureKlinesLoaded(symbol);

  const klines4h = klinesService.getClosedKlines(symbol, "4h");
  const klines1h = klinesService.getClosedKlines(symbol, "1h");

  if (!klines4h || klines4h.length < params.emaSlow + 5) {
    return { signal: null, reason: "warming_up_4h", details: { have: klines4h?.length ?? 0, need: params.emaSlow + 5 } };
  }
  if (!klines1h || klines1h.length < params.emaSlow + 5) {
    return { signal: null, reason: "warming_up_1h", details: { have: klines1h?.length ?? 0, need: params.emaSlow + 5 } };
  }

  const closes4h = klines4h.map((k) => k.close);
  const ema50_4h = ema(closes4h, params.emaFast);
  const ema200_4h = ema(closes4h, params.emaSlow);
  const last4h = klines4h[klines4h.length - 1];
  const lastEma50_4h = ema50_4h[ema50_4h.length - 1];
  const lastEma200_4h = ema200_4h[ema200_4h.length - 1];

  const trendOk = last4h.close > lastEma200_4h && lastEma50_4h > lastEma200_4h;
  if (!trendOk) {
    return {
      signal: null,
      reason: "trend_not_bullish_4h",
      details: { close: last4h.close, ema50: lastEma50_4h, ema200: lastEma200_4h },
    };
  }

  const closes1h = klines1h.map((k) => k.close);
  const ema50_1h = ema(closes1h, params.emaFast);
  const rsi1h = rsi(closes1h, params.rsiPeriod);
  const atr1h = atr(klines1h, params.atrPeriod);

  const last1h = klines1h[klines1h.length - 1];
  const prev1h = klines1h[klines1h.length - 2];
  const lastEma50_1h = ema50_1h[ema50_1h.length - 1];
  const prevEma50_1h = ema50_1h[ema50_1h.length - 2];
  const lastRsi = rsi1h[rsi1h.length - 1];
  const lastAtr = atr1h[atr1h.length - 1];

  if (!Number.isFinite(lastRsi) || !Number.isFinite(lastAtr)) {
    return { signal: null, reason: "indicators_not_ready", details: { rsi: lastRsi, atr: lastAtr } };
  }

  const lowestProximity1h = Math.min(prev1h.low, last1h.low);
  const proximityToEma = Math.abs(lowestProximity1h - lastEma50_1h) / lastEma50_1h;
  const touchedEma = lowestProximity1h <= lastEma50_1h * (1 + params.pullbackProximity) || prev1h.low <= prevEma50_1h * (1 + params.pullbackProximity);
  if (!touchedEma) {
    return {
      signal: null,
      reason: "no_pullback_to_ema50_1h",
      details: { low: lowestProximity1h, ema50_1h: lastEma50_1h, proximity: proximityToEma.toFixed(4) },
    };
  }

  if (last1h.close < lastEma50_1h) {
    return {
      signal: null,
      reason: "1h_close_below_ema50",
      details: { close: last1h.close, ema50_1h: lastEma50_1h },
    };
  }

  if (lastRsi < params.rsiMin || lastRsi > params.rsiMax) {
    return {
      signal: null,
      reason: "rsi_out_of_range",
      details: { rsi: lastRsi.toFixed(2), min: params.rsiMin, max: params.rsiMax },
    };
  }

  const cleanSymbol = symbol.replace("/", "").toLowerCase();
  const ob = marketData.getOrderBook(cleanSymbol);
  if (!ob || ob.asks.length === 0 || ob.bids.length === 0) {
    return { signal: null, reason: "no_orderbook", details: {} };
  }
  const bestAsk = ob.asks[0].price;
  const bestBid = ob.bids[0].price;
  const spread = (bestAsk - bestBid) / bestBid;
  if (spread > params.maximumSpread) {
    return {
      signal: null,
      reason: "spread_too_wide",
      details: { spread: (spread * 100).toFixed(4) + "%", max: (params.maximumSpread * 100).toFixed(4) + "%" },
    };
  }

  const entryPrice = bestAsk;
  const rawStop = entryPrice - params.atrStopMultiplier * lastAtr;
  const stopDistancePct = (entryPrice - rawStop) / entryPrice;

  if (stopDistancePct < params.minimumStopDistance) {
    return {
      signal: null,
      reason: "stop_too_tight",
      details: { stopDistancePct: (stopDistancePct * 100).toFixed(3) + "%", min: (params.minimumStopDistance * 100).toFixed(2) + "%" },
    };
  }

  const tp1RR = 1.5;
  const tp2RR = 2.5;
  const tp3RR = 4.0;
  const tp1Pct = stopDistancePct * tp1RR * 100;
  const tp2Pct = stopDistancePct * tp2RR * 100;
  const tp3Pct = stopDistancePct * tp3RR * 100;

  const grossTargetPct = stopDistancePct * params.minimumRiskRewardNet + params.estimatedFees;
  const expectedNetProfitPct = (stopDistancePct * tp1RR) - params.estimatedFees;

  if (expectedNetProfitPct < params.minimumNetExpectedProfit) {
    return {
      signal: null,
      reason: "expected_net_profit_too_low",
      details: {
        expectedNet: (expectedNetProfitPct * 100).toFixed(3) + "%",
        required: (params.minimumNetExpectedProfit * 100).toFixed(2) + "%",
      },
    };
  }

  const grossTp1 = stopDistancePct * tp1RR;
  const ratioNet = (grossTp1 - params.estimatedFees) / (stopDistancePct + params.estimatedFees);
  if (ratioNet < params.minimumRiskRewardNet) {
    return {
      signal: null,
      reason: "rr_net_below_min",
      details: { ratioNet: ratioNet.toFixed(2), min: params.minimumRiskRewardNet, grossTargetPct: (grossTargetPct * 100).toFixed(3) + "%" },
    };
  }

  const stopPct = stopDistancePct * 100;

  const positionSizeUsdt = computePositionSize(bot, stopDistancePct);

  return {
    signal: {
      side: "long",
      confidence: 100,
      signal: `Trend-Pullback: 4H trend OK · pullback EMA50 1H · RSI ${lastRsi.toFixed(1)} · stop ${stopPct.toFixed(2)}% · TP1 ${tp1Pct.toFixed(2)}% · TP2 ${tp2Pct.toFixed(2)}%`,
      tp1Pct,
      tp2Pct,
      tp3Pct,
      dynamicStopPct: stopPct,
      positionSizeUsdt,
    },
    reason: "signal_long",
    details: {
      entryPrice,
      stopPrice: rawStop,
      stopDistancePct: stopPct.toFixed(3) + "%",
      atr: lastAtr.toFixed(4),
      rsi: lastRsi.toFixed(2),
      ema50_1h: lastEma50_1h.toFixed(2),
      tp1Pct: tp1Pct.toFixed(3) + "%",
      tp2Pct: tp2Pct.toFixed(3) + "%",
      tp3Pct: tp3Pct.toFixed(3) + "%",
      ratioNet: ratioNet.toFixed(2),
    },
  };
}

export function computePositionSize(bot: Bot, stopDistancePct: number): number {
  const params = getParams(bot);
  const capital = parseFloat(bot.capitalAllocated);
  const riskMonetary = capital * params.riskPerTrade;
  const totalRiskPct = stopDistancePct + params.estimatedFees;
  if (totalRiskPct <= 0) return 0;
  return riskMonetary / totalRiskPct;
}
