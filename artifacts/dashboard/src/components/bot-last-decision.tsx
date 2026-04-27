import { useGetBotLastDecision, getGetBotLastDecisionQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, Hourglass, XCircle } from "lucide-react";

interface ReasonInfo {
  title: string;
  description: string;
  tone: "ok" | "warmup" | "filter" | "config" | "market" | "info";
}

const REASON_MAP: Record<string, ReasonInfo> = {
  signal_long: {
    title: "Señal LONG generada",
    description: "Se cumplen todas las condiciones; se intentará abrir una orden.",
    tone: "ok",
  },
  limit_order_placed: {
    title: "Orden límite colocada",
    description: "A la espera de que el precio toque el nivel objetivo.",
    tone: "info",
  },
  limit_order_pending: {
    title: "Orden límite pendiente",
    description: "Esperando que el mejor ask baje hasta el precio límite.",
    tone: "info",
  },
  limit_order_pending_no_orderbook: {
    title: "Orden pendiente, sin libro de órdenes",
    description: "No hay datos de orderbook para confirmar el llenado.",
    tone: "warmup",
  },
  limit_order_filled: {
    title: "Orden límite ejecutada",
    description: "El precio tocó el límite y la posición se abrió.",
    tone: "ok",
  },
  limit_order_expired: {
    title: "Orden límite expirada",
    description: "El precio no tocó el límite a tiempo y la orden se canceló.",
    tone: "filter",
  },
  pair_not_supported: {
    title: "Par no soportado",
    description: "Trend-Pullback solo opera BTC/USDT o ETH/USDT.",
    tone: "config",
  },
  warming_up_4h: {
    title: "Calentando velas 4H",
    description: "Aún no hay suficientes velas 4H para calcular las EMAs.",
    tone: "warmup",
  },
  warming_up_1h: {
    title: "Calentando velas 1H",
    description: "Aún no hay suficientes velas 1H para calcular EMAs/RSI/ATR.",
    tone: "warmup",
  },
  btc_reference_warming_up: {
    title: "Esperando referencia BTC",
    description: "Aún no se han cargado las velas de BTC para el filtro de correlación.",
    tone: "warmup",
  },
  indicators_not_ready: {
    title: "Indicadores aún no calculados",
    description: "RSI o ATR todavía no devuelven valores válidos.",
    tone: "warmup",
  },
  trend_not_bullish_4h: {
    title: "Tendencia 4H no alcista",
    description: "El cierre 4H está bajo la EMA200 o la EMA50 está por debajo de la EMA200.",
    tone: "filter",
  },
  no_pullback_to_ema50_1h: {
    title: "Sin pullback a la EMA50 1H",
    description: "El precio no se ha acercado lo suficiente a la EMA50 1H.",
    tone: "filter",
  },
  "1h_close_below_ema50": {
    title: "Cierre 1H por debajo de la EMA50",
    description: "Se busca confirmación con cierre 1H sobre la EMA50.",
    tone: "filter",
  },
  rsi_out_of_range: {
    title: "RSI fuera de rango",
    description: "El RSI 1H está fuera del rango configurado para el pullback.",
    tone: "filter",
  },
  no_orderbook: {
    title: "Sin libro de órdenes",
    description: "No hay bids/asks disponibles para evaluar el spread.",
    tone: "warmup",
  },
  spread_too_wide: {
    title: "Spread demasiado amplio",
    description: "El spread bid/ask supera el máximo permitido.",
    tone: "market",
  },
  stop_too_tight: {
    title: "Stop demasiado ajustado",
    description: "La distancia del stop está por debajo del mínimo configurado.",
    tone: "config",
  },
  expected_net_profit_too_low: {
    title: "Ganancia neta esperada baja",
    description: "El TP1 estimado, descontando comisiones, no llega al mínimo.",
    tone: "config",
  },
  rr_net_below_min: {
    title: "Riesgo/Beneficio neto bajo",
    description: "El R:R neto tras comisiones no alcanza el mínimo configurado.",
    tone: "config",
  },
  btc_correlation_drop: {
    title: "BTC cayendo (filtro de correlación)",
    description: "BTC retrocede demasiado; se evita abrir ETH para no arrastrarse.",
    tone: "market",
  },
  trend_4h_lost: {
    title: "Cierre lógico: tendencia 4H rota",
    description: "El cierre 4H quedó por debajo de la EMA200; el bot cerró el trade a mercado sin esperar al stop.",
    tone: "market",
  },
  ema_cross_bearish_4h: {
    title: "Cierre lógico: cruce bajista 4H",
    description: "La EMA50 4H cruzó por debajo de la EMA200 4H; el bot cerró el trade a mercado sin esperar al stop.",
    tone: "market",
  },
  structure_break_1h: {
    title: "Cierre lógico: estructura 1H rota",
    description: "El cierre 1H cayó por debajo de la EMA50 menos el margen de ATR; el bot cerró el trade a mercado sin esperar al stop.",
    tone: "market",
  },
};

function toneStyles(tone: ReasonInfo["tone"]): { card: string; title: string; Icon: typeof Activity } {
  switch (tone) {
    case "ok":
      return { card: "border-emerald-500/30 bg-emerald-500/5", title: "text-emerald-400", Icon: CheckCircle2 };
    case "warmup":
      return { card: "border-sky-500/30 bg-sky-500/5", title: "text-sky-400", Icon: Hourglass };
    case "filter":
      return { card: "border-amber-500/30 bg-amber-500/5", title: "text-amber-400", Icon: AlertTriangle };
    case "config":
      return { card: "border-red-500/30 bg-red-500/5", title: "text-red-400", Icon: XCircle };
    case "market":
      return { card: "border-purple-500/30 bg-purple-500/5", title: "text-purple-400", Icon: AlertTriangle };
    default:
      return { card: "", title: "text-foreground", Icon: Activity };
  }
}

function fallbackInfo(reason: string): ReasonInfo {
  return {
    title: reason,
    description: "Motivo no traducido. Revisa los logs del bot para más detalles.",
    tone: "info",
  };
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    if (Math.abs(value) >= 1000) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(4);
    return value.toFixed(6);
  }
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const DETAIL_LABELS: Record<string, string> = {
  rsi: "RSI",
  min: "Mínimo",
  max: "Máximo",
  spread: "Spread",
  close: "Cierre",
  ema50: "EMA50",
  ema200: "EMA200",
  ema50_1h: "EMA50 1H",
  low: "Mínimo 1H",
  proximity: "Proximidad",
  have: "Velas cargadas",
  need: "Velas necesarias",
  expectedNet: "Ganancia neta esperada",
  required: "Mínimo requerido",
  ratioNet: "R:R neto",
  grossTargetPct: "Objetivo bruto",
  stopDistancePct: "Distancia stop",
  btcPctChange1h: "BTC 1H",
  threshold: "Umbral",
  pair: "Par",
  limitPrice: "Precio límite",
  bestAsk: "Mejor ask",
  ageMs: "Antigüedad",
  remainingMs: "Restante",
  timeoutMs: "Timeout",
  fillAsk: "Ask al fill",
  expiresAt: "Expira en",
};

const HIDE_DETAIL_KEYS = new Set(["expiresAt", "supported", "btcOpen", "btcClose"]);

function relativeTime(ts: number | null | undefined): string | null {
  if (!ts || !Number.isFinite(ts)) return null;
  const diff = Date.now() - ts;
  if (diff < 0) return "ahora";
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "ahora";
  if (sec < 60) return `hace ${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  return `hace ${h}h`;
}

export function BotLastDecisionCard({
  botId,
  botStatus,
  strategy,
}: {
  botId: number;
  botStatus: string;
  strategy: string;
}) {
  const enabled = !!botId && strategy === "trend_pullback";

  const { data, isLoading } = useGetBotLastDecision(botId, {
    query: {
      enabled,
      queryKey: getGetBotLastDecisionQueryKey(botId),
      refetchInterval: enabled && botStatus === "running" ? 10_000 : false,
    },
  });

  if (!enabled) return null;

  if (isLoading || !data) {
    return (
      <Card data-testid="bot-last-decision-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Última evaluación
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">Cargando…</CardContent>
      </Card>
    );
  }

  if (!data.reason) {
    return (
      <Card data-testid="bot-last-decision-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Última evaluación
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Aún sin evaluaciones.{" "}
          {botStatus === "running"
            ? "Esperando el siguiente ciclo del bot…"
            : "Inicia el bot para ver por qué entra o no entra a operar."}
        </CardContent>
      </Card>
    );
  }

  const info = REASON_MAP[data.reason] ?? fallbackInfo(data.reason);
  const styles = toneStyles(info.tone);
  const Icon = styles.Icon;
  const evaluatedAt = relativeTime(data.evaluatedAt ?? null);
  const details = data.details ?? null;
  const detailEntries = details
    ? Object.entries(details).filter(([k]) => !HIDE_DETAIL_KEYS.has(k))
    : [];

  return (
    <Card className={styles.card} data-testid="bot-last-decision-card">
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-2 ${styles.title}`}>
          <Icon className="h-4 w-4" />
          Última evaluación
          {evaluatedAt && (
            <Badge
              variant="outline"
              className="ml-auto text-[10px]"
              data-testid="bot-last-decision-evaluated-at"
            >
              {evaluatedAt}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div>
          <p className="font-medium" data-testid="bot-last-decision-title">{info.title}</p>
          <p className="text-muted-foreground mt-0.5">{info.description}</p>
          <p
            className="text-[10px] text-muted-foreground/70 font-mono mt-1"
            data-testid="bot-last-decision-reason"
          >
            {data.reason}
          </p>
        </div>
        {detailEntries.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t border-border/40">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-muted-foreground truncate">{DETAIL_LABELS[k] ?? k}</span>
                <span className="font-mono text-right truncate">{formatDetailValue(v)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
