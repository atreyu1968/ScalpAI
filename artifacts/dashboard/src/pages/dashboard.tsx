import { useListBots, useListTrades, useGetMarketStatus, useGetRateLimitStatus, useGetAiSentimentList } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Bot, TrendingUp, TrendingDown, Activity, Wifi, WifiOff, Brain, AlertTriangle, BarChart3, BookOpen } from "lucide-react";
import { BotPhaseInline } from "@/components/bot-phase-badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useMemo, useState } from "react";
import { PriceChart } from "@/components/price-chart";
import { OrderBookVisualizer } from "@/components/order-book";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: bots, isLoading: botsLoading } = useListBots();
  const { data: trades, isLoading: tradesLoading } = useListTrades({ limit: 50, status: "closed" });
  const { data: marketStatus, isLoading: marketLoading } = useGetMarketStatus();
  const { data: rateLimit, isLoading: rateLimitLoading } = useGetRateLimitStatus();
  const { data: sentiment, isLoading: sentimentLoading } = useGetAiSentimentList();

  const activePairs = useMemo(() => {
    const defaultPairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
    if (!bots || bots.length === 0) return defaultPairs;
    const running = [...new Set(bots.filter(b => b.status === "running").map(b => b.pair))];
    if (running.length > 0) return running;
    const allBotPairs = [...new Set(bots.map(b => b.pair))];
    return allBotPairs.length > 0 ? allBotPairs.slice(0, 5) : defaultPairs;
  }, [bots]);
  const [selectedPair, setSelectedPair] = useState<string>("");

  const activeBots = bots?.filter((b) => b.status === "running").length ?? 0;
  const totalBots = bots?.length ?? 0;
  const totalPnl = bots?.reduce((sum, b) => sum + parseFloat(b.dailyPnl || "0"), 0) ?? 0;
  const activeConnections = marketStatus?.connections?.filter((c) => c.connected).length ?? 0;
  const ratePct = rateLimit ? ((rateLimit.currentWeight / rateLimit.limit) * 100) : 0;

  const pnlByBot = useMemo(() => {
    if (!bots) return [];
    return bots.map(b => ({
      name: b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name,
      pnl: parseFloat(b.dailyPnl || "0"),
      mode: b.mode,
    }));
  }, [bots]);

  const paperVsLive = useMemo(() => {
    if (!bots) return { paper: 0, live: 0 };
    const paper = bots.filter(b => b.mode === "paper").reduce((s, b) => s + parseFloat(b.dailyPnl || "0"), 0);
    const live = bots.filter(b => b.mode === "live").reduce((s, b) => s + parseFloat(b.dailyPnl || "0"), 0);
    return { paper, live };
  }, [bots]);

  const monthlyPnl = useMemo(() => {
    if (!trades || trades.length === 0) return 0;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return trades
      .filter(t => new Date(t.closedAt || t.openedAt) >= startOfMonth)
      .reduce((sum, t) => sum + parseFloat(t.pnl || "0"), 0);
  }, [trades]);

  const maxDrawdown = useMemo(() => {
    if (!trades || trades.length === 0) return 0;
    let peak = 0;
    let maxDd = 0;
    let cumPnl = 0;
    for (const t of trades) {
      cumPnl += parseFloat(t.pnl || "0");
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }, [trades]);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Panel</h1>
        <p className="text-muted-foreground">Bienvenido de nuevo, {user?.email}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Bots Activos</CardTitle>
            <Bot className="h-4 w-4 text-primary hidden sm:block" />
          </CardHeader>
          <CardContent>
            {botsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-xl sm:text-2xl font-bold" data-testid="text-active-bots">{activeBots} / {totalBots}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">PnL Diario</CardTitle>
            {totalPnl >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500 hidden sm:block" /> : <TrendingDown className="h-4 w-4 text-red-500 hidden sm:block" />}
          </CardHeader>
          <CardContent>
            {botsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className={`text-lg sm:text-2xl font-bold font-mono ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`} data-testid="text-daily-pnl">
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">PnL Mensual</CardTitle>
            {monthlyPnl >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500 hidden sm:block" /> : <TrendingDown className="h-4 w-4 text-red-500 hidden sm:block" />}
          </CardHeader>
          <CardContent>
            {tradesLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className={`text-lg sm:text-2xl font-bold font-mono ${monthlyPnl >= 0 ? "text-emerald-500" : "text-red-500"}`} data-testid="text-monthly-pnl">
                {monthlyPnl >= 0 ? "+" : ""}{monthlyPnl.toFixed(4)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Drawdown Máx.</CardTitle>
            <TrendingDown className="h-4 w-4 text-amber-500 hidden sm:block" />
          </CardHeader>
          <CardContent>
            {tradesLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-lg sm:text-2xl font-bold font-mono text-amber-500" data-testid="text-max-drawdown">
                -{maxDrawdown.toFixed(4)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Límite API</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground hidden sm:block" />
          </CardHeader>
          <CardContent>
            {rateLimitLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-lg sm:text-2xl font-bold font-mono" data-testid="text-rate-limit">{rateLimit?.remaining ?? 0}</div>
                <Progress value={ratePct} className="mt-2 h-2" />
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{rateLimit?.currentWeight ?? 0} / {rateLimit?.limit ?? 0} peso usado</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              PnL por Bot
            </CardTitle>
          </CardHeader>
          <CardContent>
            {botsLoading ? <Skeleton className="h-48 w-full" /> : pnlByBot.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={pnlByBot} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "6px", fontSize: "12px", color: "hsl(var(--foreground))" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(val: number) => [`${val >= 0 ? "+" : ""}${val.toFixed(4)} USDT`, "PnL"]}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {pnlByBot.map((entry, idx) => (
                      <Cell key={idx} fill={entry.pnl >= 0 ? "hsl(160 100% 45%)" : "hsl(0 84% 60%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">Sin bots para graficar</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm sm:text-base">Simulado vs Real</CardTitle>
          </CardHeader>
          <CardContent>
            {botsLoading ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Trading Simulado</span>
                    <span className={`font-mono font-bold ${paperVsLive.paper >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {paperVsLive.paper >= 0 ? "+" : ""}{paperVsLive.paper.toFixed(4)} USDT
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${paperVsLive.paper >= 0 ? "bg-emerald-500/60" : "bg-red-500/60"}`}
                      style={{ width: `${Math.min(Math.abs(paperVsLive.paper) / (Math.max(Math.abs(paperVsLive.paper), Math.abs(paperVsLive.live), 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Trading Real</span>
                    <span className={`font-mono font-bold ${paperVsLive.live >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {paperVsLive.live >= 0 ? "+" : ""}{paperVsLive.live.toFixed(4)} USDT
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${paperVsLive.live >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                      style={{ width: `${Math.min(Math.abs(paperVsLive.live) / (Math.max(Math.abs(paperVsLive.paper), Math.abs(paperVsLive.live), 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Bots Simulados</p>
                    <p className="text-lg font-bold">{bots?.filter(b => b.mode === "paper").length ?? 0}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Bots Reales</p>
                    <p className="text-lg font-bold">{bots?.filter(b => b.mode === "live").length ?? 0}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Wifi className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Datos de Mercado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {marketLoading ? <Skeleton className="h-20 w-full" /> : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  {activeConnections > 0 ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
                  <span className="font-bold text-lg">{activeConnections}</span>
                  <span className="text-muted-foreground">flujos activos</span>
                </div>
                {marketStatus?.connections && marketStatus.connections.length > 0 && (
                  <div className="space-y-1">
                    {marketStatus.connections.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`h-2 w-2 rounded-full ${c.connected ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="font-mono">{c.symbol}</span>
                        <span className="text-muted-foreground">{c.futures ? "futuros" : "spot"}</span>
                        {c.hasOrderBook && <Badge variant="outline" className="text-[10px] px-1 py-0">OB</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Sentimiento IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : sentiment?.pairs && sentiment.pairs.length > 0 ? (
              <div className="space-y-3">
                {sentiment.pairs.map((s) => (
                  <div key={s.pair} className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid={`sentiment-${s.pair}`}>
                    <div>
                      <span className="font-mono font-semibold text-sm">{s.pair}</span>
                      <p className="text-xs text-muted-foreground">
                        {s.analysisCount} análisis
                        {s.errorCount > 0 ? ` · ${s.errorCount} errores` : ""}
                        {typeof s.filteredCount === "number" && s.filteredCount > 0 ? ` · ${s.filteredCount} descartes` : ""}
                      </p>
                      {s.status === "filtered" && s.lastFilterReason && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1 max-w-[250px] truncate" title={s.lastFilterReason}>
                          Último descarte: {s.lastFilterReason}
                        </p>
                      )}
                      {s.lastError && (
                        <p className="text-xs text-destructive mt-1 max-w-[250px] truncate" title={s.lastError}>
                          {s.lastError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === "error" ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : s.lastSignal ? (
                        <Badge variant={s.lastSignal.action === "LONG" ? "default" : s.lastSignal.action === "SHORT" ? "destructive" : "secondary"}>
                          {s.lastSignal.action} ({(s.lastSignal.confidence * 100).toFixed(0)}%)
                        </Badge>
                      ) : s.status === "filtered" ? (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-500">Filtrado</Badge>
                      ) : (
                        <Badge variant="outline">{s.status === "waiting" ? "Esperando" : s.status}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin señales IA activas</p>
                <p className="text-xs">Inicia un bot para generar datos de sentimiento</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Mercado en Vivo</h2>
          <div className="flex gap-1 ml-0 sm:ml-4">
            {activePairs.map(pair => (
              <button
                key={pair}
                onClick={() => setSelectedPair(pair)}
                className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
                  (selectedPair || activePairs[0]) === pair
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {pair}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Gráfico de Precio — {selectedPair || activePairs[0]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PriceChart symbol={selectedPair || activePairs[0]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Libro de Órdenes — {selectedPair || activePairs[0]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OrderBookVisualizer symbol={selectedPair || activePairs[0]} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Operaciones Recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : trades && trades.length > 0 ? (
            <div className="space-y-2">
              {trades.slice(0, 8).map((t) => {
                const pnl = parseFloat(t.pnl || "0");
                return (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm" data-testid={`trade-${t.id}`}>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${t.side === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {t.side === "buy" ? "COMPRA" : "VENTA"}
                      </span>
                      <span className="font-mono">{t.pair}</span>
                    </div>
                    <span className={`font-mono ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin operaciones recientes</p>
            </div>
          )}
        </CardContent>
      </Card>

      {bots && bots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm sm:text-base">Resumen de Bots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3">Nombre</th>
                    <th className="text-left py-2 px-3">Par</th>
                    <th className="text-left py-2 px-3">Modo</th>
                    <th className="text-left py-2 px-3">Estado</th>
                    <th className="text-right py-2 px-3">PnL Diario</th>
                    <th className="text-right py-2 px-3">Apalanc.</th>
                  </tr>
                </thead>
                <tbody>
                  {bots.map((bot) => {
                    const pnl = parseFloat(bot.dailyPnl || "0");
                    return (
                      <tr key={bot.id} className="border-b border-muted/50 hover:bg-muted/30" data-testid={`bot-row-${bot.id}`}>
                        <td className="py-2 px-3 font-medium">{bot.name}</td>
                        <td className="py-2 px-3 font-mono text-xs">{bot.pair}</td>
                        <td className="py-2 px-3">
                          <Badge variant={bot.mode === "live" ? "default" : "secondary"} className="text-xs">
                            {bot.mode === "live" ? "real" : "simulado"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3"><BotPhaseInline botId={bot.id} botStatus={bot.status} /></td>
                        <td className={`py-2 px-3 text-right font-mono ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-right">{bot.marketType === "futures" ? `${bot.operationalLeverage}x` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
