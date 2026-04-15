import { useState, useCallback } from "react";
import { useListTrades } from "@workspace/api-client-react";
import type { TradeLogItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";

export default function TradesPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const params = {
    limit,
    offset,
    ...(statusFilter !== "all" ? { status: statusFilter as "open" | "closed" | "cancelled" } : {}),
  };

  const { data: trades, isLoading } = useListTrades(params);

  const exportCsv = useCallback(() => {
    if (!trades || trades.length === 0) return;
    const headers = ["ID", "Bot ID", "Par", "Lado", "Modo", "Estado", "Entrada", "Salida", "Cant.", "PnL", "Comisión", "Deslizamiento", "Señal IA", "Confianza", "TP IA %", "Apertura", "Cierre"];
    const rows = trades.map((t: TradeLogItem) => [
      t.id, t.botId, t.pair, t.side, t.mode, t.status, t.entryPrice, t.exitPrice || "", t.quantity,
      t.pnl || "", t.commission || "", t.slippage || "", t.aiSignal || "", t.aiConfidence || "", t.aiTakeProfitPct || "", t.openedAt, t.closedAt || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scalpai-operaciones-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trades]);

  const statusLabels: Record<string, string> = {
    open: "abierta", closed: "cerrada", cancelled: "cancelada"
  };

  return (
    <div className="space-y-6" data-testid="trades-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Historial de Operaciones</h1>
          <p className="text-muted-foreground">Consulta y exporta tu registro de operaciones</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
            <SelectTrigger className="w-32" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="open">Abiertas</SelectItem>
              <SelectItem value="closed">Cerradas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!trades || trades.length === 0} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : trades && trades.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs bg-muted/30">
                      <th className="text-left py-3 px-3">ID</th>
                      <th className="text-left py-3 px-3">Lado</th>
                      <th className="text-left py-3 px-3">Par</th>
                      <th className="text-left py-3 px-3">Modo</th>
                      <th className="text-right py-3 px-3">Entrada</th>
                      <th className="text-right py-3 px-3">Salida</th>
                      <th className="text-right py-3 px-3">Cant.</th>
                      <th className="text-right py-3 px-3">PnL</th>
                      <th className="text-right py-3 px-3">Comisión</th>
                      <th className="text-left py-3 px-3">Señal IA</th>
                      <th className="text-right py-3 px-3">TP IA</th>
                      <th className="text-left py-3 px-3">Estado</th>
                      <th className="text-left py-3 px-3">Apertura</th>
                      <th className="text-left py-3 px-3">Cierre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => {
                      const pnl = parseFloat(t.pnl || "0");
                      return (
                        <tr key={t.id} className="border-b border-muted/20 hover:bg-muted/10" data-testid={`trade-row-${t.id}`}>
                          <td className="py-2 px-3 text-muted-foreground">#{t.id}</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${t.side === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                              {t.side === "buy" ? "COMPRA" : "VENTA"}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-xs">{t.pair}</td>
                          <td className="py-2 px-3"><Badge variant={t.mode === "live" ? "default" : "secondary"} className="text-xs">{t.mode === "live" ? "real" : "simulado"}</Badge></td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{t.entryPrice}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{t.exitPrice || "-"}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{t.quantity}</td>
                          <td className={`py-2 px-3 text-right font-mono text-xs ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                            {t.pnl ? (pnl >= 0 ? "+" : "") + pnl.toFixed(4) : "-"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs">{t.commission || "-"}</td>
                          <td className="py-2 px-3 text-xs">{t.aiSignal || "-"}</td>
                          <td className="py-2 px-3 text-right font-mono text-xs text-yellow-400">{t.aiTakeProfitPct ? `${t.aiTakeProfitPct}%` : "-"}</td>
                          <td className="py-2 px-3"><Badge variant="outline" className="text-xs">{statusLabels[t.status] || t.status}</Badge></td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(t.openedAt).toLocaleString()}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">{t.closedAt ? new Date(t.closedAt).toLocaleString() : "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-3 border-t">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} data-testid="button-prev">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Mostrando {offset + 1} - {offset + trades.length}</span>
                <Button variant="outline" size="sm" disabled={trades.length < limit} onClick={() => setOffset(offset + limit)} data-testid="button-next">
                  Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No se encontraron operaciones</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
