import { useListBots, useListTrades, useGetMarketStatus, useGetRateLimitStatus, useGetAiSentimentList } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Bot, TrendingUp, TrendingDown, Activity, Wifi, WifiOff, Brain, AlertTriangle, CircleDot } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    stopped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    error: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${variants[status] || variants.stopped}`}>
      <CircleDot className="h-3 w-3 mr-1" />
      {status}
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: bots, isLoading: botsLoading } = useListBots();
  const { data: trades, isLoading: tradesLoading } = useListTrades({ limit: 10, status: "closed" });
  const { data: marketStatus, isLoading: marketLoading } = useGetMarketStatus();
  const { data: rateLimit, isLoading: rateLimitLoading } = useGetRateLimitStatus();
  const { data: sentiment, isLoading: sentimentLoading } = useGetAiSentimentList();

  const activeBots = bots?.filter((b) => b.status === "running").length ?? 0;
  const totalBots = bots?.length ?? 0;
  const totalPnl = bots?.reduce((sum, b) => sum + parseFloat(b.dailyPnl || "0"), 0) ?? 0;
  const activeConnections = marketStatus?.connections?.filter((c) => c.connected).length ?? 0;
  const ratePct = rateLimit ? ((rateLimit.currentWeight / rateLimit.limit) * 100) : 0;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Bots</CardTitle>
            <Bot className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {botsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold" data-testid="text-active-bots">{activeBots} / {totalBots}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Daily PnL</CardTitle>
            {totalPnl >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            {botsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className={`text-2xl font-bold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`} data-testid="text-daily-pnl">
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)} USDT
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Data</CardTitle>
            {activeConnections > 0 ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            {marketLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold" data-testid="text-market-connections">
                {activeConnections} streams
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">API Rate Limit</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {rateLimitLoading ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold" data-testid="text-rate-limit">{rateLimit?.remaining ?? 0}</div>
                <Progress value={ratePct} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">{rateLimit?.currentWeight ?? 0} / {rateLimit?.limit ?? 0} weight used</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              AI Sentiment
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
                      <p className="text-xs text-muted-foreground">{s.analysisCount} analyses</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.lastSignal ? (
                        <Badge variant={s.lastSignal.action === "LONG" ? "default" : s.lastSignal.action === "SHORT" ? "destructive" : "secondary"}>
                          {s.lastSignal.action} ({(s.lastSignal.confidence * 100).toFixed(0)}%)
                        </Badge>
                      ) : (
                        <Badge variant="outline">{s.status}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No active AI signals</p>
                <p className="text-xs">Start a bot to generate AI sentiment data</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Trades
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tradesLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : trades && trades.length > 0 ? (
              <div className="space-y-2">
                {trades.slice(0, 5).map((t) => {
                  const pnl = parseFloat(t.pnl || "0");
                  return (
                    <div key={t.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm" data-testid={`trade-${t.id}`}>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${t.side === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                          {t.side.toUpperCase()}
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
                <p className="text-sm">No recent trades</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {bots && bots.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bot Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3">Name</th>
                    <th className="text-left py-2 px-3">Pair</th>
                    <th className="text-left py-2 px-3">Mode</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Daily PnL</th>
                    <th className="text-right py-2 px-3">Leverage</th>
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
                            {bot.mode}
                          </Badge>
                        </td>
                        <td className="py-2 px-3"><StatusBadge status={bot.status} /></td>
                        <td className={`py-2 px-3 text-right font-mono ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                        </td>
                        <td className="py-2 px-3 text-right">{bot.leverage}x</td>
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
