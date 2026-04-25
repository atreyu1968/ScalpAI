import { useEffect, useState } from "react";
import { useGetBotPendingOrder, getGetBotPendingOrderQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hourglass, CheckCircle2, XCircle, ListChecks } from "lucide-react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export function PendingLimitOrderCard({
  botId,
  botStatus,
  strategy,
}: {
  botId: number;
  botStatus: string;
  strategy: string;
}) {
  const enabled = !!botId && strategy === "trend_pullback";

  const { data, isLoading } = useGetBotPendingOrder(botId, {
    query: {
      enabled,
      queryKey: getGetBotPendingOrderQueryKey(botId),
      refetchInterval: enabled && botStatus === "running" ? 5000 : false,
    },
  });

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (data?.status !== "pending") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data?.status]);

  if (!enabled) return null;
  if (isLoading || !data) return null;

  if (data.status === "none") {
    return (
      <Card data-testid="pending-limit-order-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            Orden límite Trend-Pullback
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Sin orden límite reciente.
        </CardContent>
      </Card>
    );
  }

  if (data.status === "pending") {
    const remainingMs = data.expiresAt
      ? Math.max(0, data.expiresAt - now)
      : data.remainingMs ?? 0;
    const noOrderbook = data.reason === "limit_order_pending_no_orderbook";
    return (
      <Card
        className="border-amber-500/30 bg-amber-500/5"
        data-testid="pending-limit-order-card"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
            <Hourglass className="h-4 w-4 animate-pulse" />
            Orden límite pendiente
            <Badge variant="outline" className="ml-auto text-[10px]">
              expira en {formatRemaining(remainingMs)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio límite</span>
            <span className="font-mono">{formatPrice(data.limitPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mejor ask</span>
            <span className="font-mono">
              {noOrderbook ? "sin libro" : formatPrice(data.bestAsk)}
            </span>
          </div>
          {data.ageMs !== null && data.ageMs !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Antigüedad</span>
              <span className="font-mono">{formatRemaining(data.ageMs)}</span>
            </div>
          )}
          {noOrderbook && (
            <p className="text-[11px] text-amber-400/80 mt-1">
              Aún sin libro de órdenes para confirmar el fill.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (data.status === "filled") {
    return (
      <Card
        className="border-emerald-500/30 bg-emerald-500/5"
        data-testid="pending-limit-order-card"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Última orden límite: ejecutada
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Precio límite</span>
            <span className="font-mono">{formatPrice(data.limitPrice)}</span>
          </div>
          {data.bestAsk !== null && data.bestAsk !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ask al fill</span>
              <span className="font-mono">{formatPrice(data.bestAsk)}</span>
            </div>
          )}
          {data.ageMs !== null && data.ageMs !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tiempo activo</span>
              <span className="font-mono">{formatRemaining(data.ageMs)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="border-red-500/30 bg-red-500/5"
      data-testid="pending-limit-order-card"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-red-400">
          <XCircle className="h-4 w-4" />
          Última orden límite: expirada
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Precio límite</span>
          <span className="font-mono">{formatPrice(data.limitPrice)}</span>
        </div>
        {data.timeoutMs !== null && data.timeoutMs !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Timeout</span>
            <span className="font-mono">{formatRemaining(data.timeoutMs)}</span>
          </div>
        )}
        {data.ageMs !== null && data.ageMs !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Antigüedad</span>
            <span className="font-mono">{formatRemaining(data.ageMs)}</span>
          </div>
        )}
        <p className="text-[11px] text-red-400/80 mt-1">
          La orden caducó antes de tocar el precio. Esperando nueva señal.
        </p>
      </CardContent>
    </Card>
  );
}
