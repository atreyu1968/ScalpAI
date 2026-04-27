import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, botsTable, tradeLogsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { signalService } from "../services/signalService";
import { patternEngine } from "../services/patternRecognition";
import { botManager } from "../services/botManager";
import {
  getLastDecision as getTrendPullbackLastDecision,
  type TrendPullbackDecision,
} from "../services/trendPullback";

const router: IRouter = Router();

interface TrendPullbackPhasePayload {
  phase: "warming_up" | "waiting" | "scanning" | "in_trade" | "stopped";
  label: string;
  detail?: string;
}

export function buildTrendPullbackPhase(
  decision: TrendPullbackDecision | undefined,
  hasOpenTrade: boolean,
): TrendPullbackPhasePayload {
  if (hasOpenTrade) {
    return { phase: "in_trade", label: "En operación" };
  }
  // Salidas lógicas (cuando ya no hay trade abierto pero la última acción fue
  // un cierre por invalidación de tesis). Mostramos por qué cerró el bot.
  if (decision) {
    switch (decision.reason) {
      case "trend_4h_lost":
        return {
          phase: "scanning",
          label: "Cierre lógico: tendencia 4H rota",
          detail: "El cierre 4H quedó por debajo de la EMA200; trade cerrado a mercado",
        };
      case "ema_cross_bearish_4h":
        return {
          phase: "scanning",
          label: "Cierre lógico: cruce bajista 4H",
          detail: "EMA50 4H cayó por debajo de la EMA200 4H; trade cerrado a mercado",
        };
      case "structure_break_1h":
        return {
          phase: "scanning",
          label: "Cierre lógico: estructura 1H rota",
          detail: "Cierre 1H bajo EMA50 menos el margen ATR; trade cerrado a mercado",
        };
    }
  }
  if (!decision) {
    return {
      phase: "warming_up",
      label: "Cargando datos de Binance…",
      detail: "Aún no se ha completado el primer ciclo de evaluación",
    };
  }
  switch (decision.reason) {
    case "warming_up_4h":
      return {
        phase: "warming_up",
        label: "Calentando velas 4H",
        detail: "Cargando histórico 4H desde Binance",
      };
    case "warming_up_1h":
      return {
        phase: "warming_up",
        label: "Calentando velas 1H",
        detail: "Cargando histórico 1H desde Binance",
      };
    case "btc_reference_warming_up":
      return {
        phase: "warming_up",
        label: "Esperando referencia BTC",
        detail: "Cargando velas BTC para el filtro de correlación",
      };
    case "indicators_not_ready":
      return {
        phase: "warming_up",
        label: "Calculando indicadores",
        detail: "Esperando que RSI/ATR estén listos",
      };
    case "no_orderbook":
      return {
        phase: "warming_up",
        label: "Esperando libro de órdenes",
        detail: "Conectando con el stream de Binance",
      };
    case "limit_order_placed":
    case "limit_order_pending":
      return {
        phase: "waiting",
        label: "Orden límite pendiente",
        detail: "A la espera de que el precio toque el límite",
      };
    case "limit_order_pending_no_orderbook":
      return {
        phase: "waiting",
        label: "Orden pendiente",
        detail: "Sin libro de órdenes para confirmar el llenado",
      };
    case "limit_order_filled":
      return {
        phase: "in_trade",
        label: "Abriendo posición",
        detail: "Orden límite ejecutada",
      };
    case "limit_order_expired":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Orden límite expirada — buscando nueva señal",
      };
    case "trend_not_bullish_4h":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Tendencia 4H no alcista",
      };
    case "no_pullback_to_ema50_1h":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Esperando pullback a la EMA50 1H",
      };
    case "1h_close_below_ema50":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Esperando cierre 1H sobre la EMA50",
      };
    case "rsi_out_of_range":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "RSI 1H fuera del rango configurado",
      };
    case "spread_too_wide":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Spread bid/ask demasiado amplio",
      };
    case "stop_too_tight":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Stop demasiado ajustado para abrir",
      };
    case "expected_net_profit_too_low":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "Ganancia neta esperada por debajo del mínimo",
      };
    case "rr_net_below_min":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "R:R neto bajo el mínimo configurado",
      };
    case "btc_correlation_drop":
      return {
        phase: "scanning",
        label: "Analizando",
        detail: "BTC retrocede — esperando recuperación",
      };
    case "pair_not_supported":
      return {
        phase: "stopped",
        label: "Par no soportado",
        detail: "Trend-Pullback solo opera BTC/USDT y ETH/USDT",
      };
    case "signal_long":
      return {
        phase: "in_trade",
        label: "Abriendo posición",
        detail: "Señal LONG generada",
      };
    default:
      return {
        phase: "scanning",
        label: "Analizando",
        detail: decision.reason,
      };
  }
}

router.get("/ai/bot-phase/:botId", requireAuth, async (req, res): Promise<void> => {
  const botId = parseInt(req.params.botId as string);
  if (isNaN(botId)) {
    res.status(400).json({ error: "Invalid botId" });
    return;
  }

  const userId = (req as any).user?.userId;
  const [bot] = await db
    .select()
    .from(botsTable)
    .where(and(eq(botsTable.id, botId), eq(botsTable.userId, userId)));
  if (!bot) {
    res.status(404).json({ error: "Bot no encontrado" });
    return;
  }

  if (bot.status === "stopped" || !botManager.isRunning(botId)) {
    if (bot.status === "paused") {
      const reason = bot.pauseReason || "Pausado por el sistema";
      res.json({ phase: "paused", label: "Pausado", reason, candles1m: 0, candles5m: 0, requiredCandles: 50 });
      return;
    }
    res.json({ phase: "stopped", label: "Detenido", candles1m: 0, candles5m: 0, requiredCandles: 50 });
    return;
  }

  if (bot.strategy === "trend_pullback") {
    const openTrades = await db
      .select({ id: tradeLogsTable.id })
      .from(tradeLogsTable)
      .where(and(eq(tradeLogsTable.botId, botId), eq(tradeLogsTable.status, "open")));
    const decision = getTrendPullbackLastDecision(botId);
    const phase = buildTrendPullbackPhase(decision, openTrades.length > 0);
    res.json({
      ...phase,
      candles1m: 0,
      candles5m: 0,
      requiredCandles: 0,
    });
    return;
  }

  const symbol = bot.pair.replace("/", "").toLowerCase();
  const useFutures = bot.marketType === "futures";
  const obKey = useFutures ? `f:${symbol}` : symbol;
  const counts = patternEngine.getCandleCount(obKey);
  const requiredCandles = 50;
  const patternsReady = counts.candles1m >= requiredCandles;

  if (!patternsReady) {
    const progress = Math.round((counts.candles1m / requiredCandles) * 100);
    const remainingMin = Math.max(0, requiredCandles - counts.candles1m);
    res.json({
      phase: "warming_up",
      label: "Calentamiento",
      progress,
      remainingMinutes: remainingMin,
      candles1m: counts.candles1m,
      candles5m: counts.candles5m,
      requiredCandles,
    });
    return;
  }

  const analysis = patternEngine.analyze(obKey);
  if (!analysis) {
    res.json({ phase: "warming_up", label: "Calentamiento", progress: 0, candles1m: counts.candles1m, candles5m: counts.candles5m, requiredCandles });
    return;
  }

  const regime = analysis.regime;
  const trend = analysis.trend;

  if (regime.adx < 20) {
    res.json({
      phase: "waiting",
      label: "Esperando tendencia",
      detail: `ADX ${regime.adx.toFixed(1)} < 20 — mercado lateral`,
      trend: trend.direction,
      emaAlignment: trend.emaAlignment,
      adx: regime.adx,
      regime: regime.type,
      candles1m: counts.candles1m,
      candles5m: counts.candles5m,
      requiredCandles,
    });
    return;
  }

  if (trend.emaAlignment === "mixed") {
    res.json({
      phase: "waiting",
      label: "Esperando alineación",
      detail: "EMAs sin alinear — señales mixtas",
      trend: trend.direction,
      emaAlignment: trend.emaAlignment,
      adx: regime.adx,
      regime: regime.type,
      candles1m: counts.candles1m,
      candles5m: counts.candles5m,
      requiredCandles,
    });
    return;
  }

  const openTrades = await db
    .select()
    .from(tradeLogsTable)
    .where(and(eq(tradeLogsTable.botId, botId), eq(tradeLogsTable.status, "open")));

  if (openTrades.length > 0) {
    res.json({
      phase: "in_trade",
      label: "En operación",
      detail: `${openTrades[0].side.toUpperCase()} abierto`,
      trend: trend.direction,
      emaAlignment: trend.emaAlignment,
      adx: regime.adx,
      regime: regime.type,
      candles1m: counts.candles1m,
      candles5m: counts.candles5m,
      requiredCandles,
    });
    return;
  }

  res.json({
    phase: "scanning",
    label: "Analizando",
    detail: `Tendencia ${trend.direction === "up" ? "alcista" : trend.direction === "down" ? "bajista" : "lateral"} — ADX ${regime.adx.toFixed(1)} — buscando confluencia`,
    trend: trend.direction,
    emaAlignment: trend.emaAlignment,
    adx: regime.adx,
    regime: regime.type,
    candles1m: counts.candles1m,
    candles5m: counts.candles5m,
    requiredCandles,
  });
});

router.get("/ai/candles/:symbol", requireAuth, async (req, res): Promise<void> => {
  const symbol = req.params.symbol as string;
  const timeframe = (req.query.tf as string) === "5m" ? "5m" : "1m";
  const candles = patternEngine.getCandleHistory(symbol.toLowerCase(), timeframe);
  res.json({ symbol, timeframe, candles });
});

function computeStatus(s: {
  lastError: string | null;
  lastSignal: unknown;
  lastFilteredAt: number | null;
  lastAnalysisAt: number | null;
}): "error" | "active" | "filtered" | "waiting" {
  if (s.lastError) return "error";
  const recentMs = 60_000;
  const now = Date.now();
  const filterRecent = !!s.lastFilteredAt && now - s.lastFilteredAt < recentMs;
  const analysisRecent = !!s.lastAnalysisAt && now - s.lastAnalysisAt < recentMs;
  if (filterRecent && (!analysisRecent || (s.lastFilteredAt ?? 0) > (s.lastAnalysisAt ?? 0))) {
    return "filtered";
  }
  if (s.lastSignal) return "active";
  return "waiting";
}

router.get("/ai/sentiment", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user?.userId;
  const allSentiments = userId ? signalService.getAllSentimentsForUser(userId) : [];
  const configured = await signalService.isConfigured(userId);

  res.json({
    configured,
    configError: configured ? null : "API key de DeepSeek no configurada. Ve a Administración → Configuración IA.",
    pairs: allSentiments.map((s) => ({
      pair: s.pair,
      status: computeStatus(s),
      lastSignal: s.lastSignal,
      lastAnalysisAt: s.lastAnalysisAt ? new Date(s.lastAnalysisAt).toISOString() : null,
      analysisCount: s.analysisCount,
      errorCount: s.errorCount,
      lastError: s.lastError,
      filteredCount: s.filteredCount,
      lastFilteredAt: s.lastFilteredAt ? new Date(s.lastFilteredAt).toISOString() : null,
      lastFilterReason: s.lastFilterReason,
      filterReasonCounts: s.filterReasonCounts,
    })),
    batchIntervalMs: signalService.getBatchInterval(),
  });
});

router.get("/ai/sentiment/:pair", requireAuth, async (req, res): Promise<void> => {
  const pair = decodeURIComponent(req.params.pair as string);
  const userId = req.user?.userId;
  const sentiment = userId ? signalService.getSentimentForUser(userId, pair) : null;

  if (!sentiment) {
    res.json({
      pair,
      status: "no_data",
      lastSignal: null,
      lastSnapshot: null,
      lastAnalysisAt: null,
      analysisCount: 0,
      errorCount: 0,
      lastError: null,
      filteredCount: 0,
      lastFilteredAt: null,
      lastFilterReason: null,
      filterReasonCounts: {},
    });
    return;
  }

  res.json({
    pair: sentiment.pair,
    status: computeStatus(sentiment),
    filteredCount: sentiment.filteredCount,
    lastFilteredAt: sentiment.lastFilteredAt ? new Date(sentiment.lastFilteredAt).toISOString() : null,
    lastFilterReason: sentiment.lastFilterReason,
    filterReasonCounts: sentiment.filterReasonCounts,
    lastSignal: sentiment.lastSignal,
    lastSnapshot: sentiment.lastSnapshot
      ? {
          orderBook: {
            spread: sentiment.lastSnapshot.orderBook.spread,
            spreadBps: sentiment.lastSnapshot.orderBook.spreadBps,
            volumeImbalance: sentiment.lastSnapshot.orderBook.volumeImbalance,
            bidDepth: sentiment.lastSnapshot.orderBook.bidDepth,
            askDepth: sentiment.lastSnapshot.orderBook.askDepth,
          },
          recentTrades: sentiment.lastSnapshot.recentTrades,
          indicators: sentiment.lastSnapshot.indicators,
        }
      : null,
    lastAnalysisAt: sentiment.lastAnalysisAt
      ? new Date(sentiment.lastAnalysisAt).toISOString()
      : null,
    analysisCount: sentiment.analysisCount,
    errorCount: sentiment.errorCount,
    lastError: sentiment.lastError,
  });
});

export default router;
