import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetBot, useListTrades, useStartBot, useStopBot, useKillBot, useUpdateBot, useDeleteBot,
  getGetBotQueryKey, getListBotsQueryKey, useGetAiSentimentByPair
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Play, Square, Skull, TrendingUp, TrendingDown, Brain, BarChart3, BookOpen } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { PriceChart } from "@/components/price-chart";
import { OrderBookVisualizer } from "@/components/order-book";

export default function BotDetailPage() {
  const [, params] = useRoute("/bots/:id");
  const id = parseInt(params?.id || "0");
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: bot, isLoading } = useGetBot(id, { query: { enabled: !!id, queryKey: getGetBotQueryKey(id) } });
  const { data: trades, isLoading: tradesLoading } = useListTrades({ botId: id, limit: 50 });
  const { data: sentiment } = useGetAiSentimentByPair(bot?.pair ? encodeURIComponent(bot.pair) : "", {
    query: { enabled: !!bot?.pair, queryKey: [`/api/ai/sentiment/${bot?.pair}`] }
  });

  const startBot = useStartBot();
  const stopBot = useStopBot();
  const killBot = useKillBot();
  const deleteBot = useDeleteBot();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetBotQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListBotsQueryKey() });
  };

  const handleAction = (action: "start" | "stop" | "kill") => {
    const mutations = { start: startBot, stop: stopBot, kill: killBot };
    mutations[action].mutate({ id }, {
      onSuccess: () => { invalidate(); toast({ title: `Bot ${action}ed` }); },
      onError: (err: unknown) => { toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Failed", variant: "destructive" }); },
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this bot permanently?")) return;
    deleteBot.mutate({ id }, {
      onSuccess: () => { setLocation("/bots"); toast({ title: "Bot deleted" }); },
    });
  };

  const closedTrades = useMemo(() => trades?.filter(t => t.status === "closed") ?? [], [trades]);
  const wins = closedTrades.filter(t => parseFloat(t.pnl || "0") > 0).length;
  const winRate = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "0";
  const totalPnl = closedTrades.reduce((s, t) => s + parseFloat(t.pnl || "0"), 0);

  const pnlChartData = useMemo(() => {
    if (closedTrades.length === 0) return [];
    let cumulative = 0;
    return closedTrades.map((t, i) => {
      cumulative += parseFloat(t.pnl || "0");
      return {
        trade: i + 1,
        pnl: parseFloat(cumulative.toFixed(4)),
        date: new Date(t.closedAt || t.openedAt).toLocaleDateString(),
      };
    });
  }, [closedTrades]);

  const maxDrawdown = useMemo(() => {
    let peak = 0;
    let maxDd = 0;
    let cumPnl = 0;
    for (const t of closedTrades) {
      cumPnl += parseFloat(t.pnl || "0");
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak - cumPnl;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }, [closedTrades]);

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  if (!bot) return <div className="text-center py-12 text-muted-foreground">Bot not found</div>;

  const pnl = parseFloat(bot.dailyPnl || "0");

  return (
    <div className="space-y-6" data-testid="bot-detail-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/bots")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold" data-testid="text-bot-name">{bot.name}</h1>
            <Badge variant={bot.mode === "live" ? "default" : "secondary"}>{bot.mode}</Badge>
            <Badge variant="outline">{bot.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {bot.status !== "running" ? (
            <Button size="sm" onClick={() => handleAction("start")} data-testid="button-start"><Play className="h-4 w-4 mr-1" /> Start</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => handleAction("stop")} data-testid="button-stop"><Square className="h-4 w-4 mr-1" /> Stop</Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => handleAction("kill")} data-testid="button-kill"><Skull className="h-4 w-4 mr-1" /> Kill</Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete} data-testid="button-delete">Delete</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pair</p>
            <p className="text-lg font-mono font-bold" data-testid="text-bot-pair">{bot.pair}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Daily PnL</p>
            <p className={`text-lg font-mono font-bold ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-lg font-bold">{winRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total PnL</p>
            <p className={`text-lg font-mono font-bold ${totalPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <p className="text-lg font-mono font-bold text-amber-500">-{maxDrawdown.toFixed(4)}</p>
          </CardContent>
        </Card>
      </div>

      {pnlChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Cumulative PnL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={pnlChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <XAxis dataKey="trade" tick={{ fontSize: 11 }} label={{ value: "Trade #", position: "insideBottom", offset: -3 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(220 25% 8%)", border: "1px solid hsl(220 20% 16%)", borderRadius: "6px", fontSize: "12px" }}
                  labelStyle={{ color: "hsl(220 15% 90%)" }}
                  formatter={(val: number) => [`${val >= 0 ? "+" : ""}${val.toFixed(4)} USDT`, "Cumulative PnL"]}
                  labelFormatter={(label) => `Trade #${label}`}
                />
                <ReferenceLine y={0} stroke="hsl(220 15% 30%)" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="pnl" stroke="hsl(160 100% 45%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Price Chart — {bot.pair}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PriceChart symbol={bot.pair} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Order Book — {bot.pair}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OrderBookVisualizer symbol={bot.pair} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Configuration</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Leverage</span><span className="font-mono">{bot.leverage}x</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Capital</span><span className="font-mono">{bot.capitalAllocated} USDT</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">AI Confidence</span><span className="font-mono">{(parseFloat(bot.aiConfidenceThreshold) * 100).toFixed(0)}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Stop Loss</span><span className="font-mono">{bot.stopLossPercent}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Max Drawdown</span><span className="font-mono">{bot.maxDailyDrawdownPercent}%</span></div>
            {bot.pausedUntil && <div className="flex justify-between"><span className="text-muted-foreground">Paused Until</span><span className="font-mono text-amber-400">{new Date(bot.pausedUntil).toLocaleString()}</span></div>}
          </CardContent>
        </Card>

        {sentiment && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4" /> AI Sentiment</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="outline">{sentiment.status}</Badge></div>
              {sentiment.lastSignal && (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Signal</span>
                    <Badge variant={sentiment.lastSignal.action === "LONG" ? "default" : sentiment.lastSignal.action === "SHORT" ? "destructive" : "secondary"}>
                      {sentiment.lastSignal.action}
                    </Badge>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Confidence</span><span className="font-mono">{(sentiment.lastSignal.confidence * 100).toFixed(1)}%</span></div>
                  <p className="text-xs text-muted-foreground mt-2 italic">{sentiment.lastSignal.reasoning}</p>
                </>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Analyses</span><span>{sentiment.analysisCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Errors</span><span>{sentiment.errorCount}</span></div>
            </CardContent>
          </Card>
        )}

        <Card className={sentiment ? "" : "lg:col-span-2"}>
          <CardHeader><CardTitle className="text-sm">Performance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Total Trades</span><span>{closedTrades.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Wins</span><span className="text-emerald-500">{wins}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Losses</span><span className="text-red-500">{closedTrades.length - wins}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Win Rate</span><span className="font-bold">{winRate}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Max Drawdown</span><span className="font-mono text-amber-500">-{maxDrawdown.toFixed(4)}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg PnL/Trade</span>
              <span className="font-mono">{closedTrades.length > 0 ? (totalPnl / closedTrades.length).toFixed(4) : "0"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Trade History</CardTitle></CardHeader>
        <CardContent>
          {tradesLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : trades && trades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-2">Side</th>
                    <th className="text-left py-2 px-2">Pair</th>
                    <th className="text-right py-2 px-2">Entry</th>
                    <th className="text-right py-2 px-2">Exit</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2">PnL</th>
                    <th className="text-left py-2 px-2">Signal</th>
                    <th className="text-left py-2 px-2">Status</th>
                    <th className="text-left py-2 px-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => {
                    const tPnl = parseFloat(t.pnl || "0");
                    return (
                      <tr key={t.id} className="border-b border-muted/30 hover:bg-muted/20" data-testid={`trade-row-${t.id}`}>
                        <td className="py-1.5 px-2">
                          <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${t.side === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                            {t.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-mono text-xs">{t.pair}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-xs">{t.entryPrice}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-xs">{t.exitPrice || "-"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-xs">{t.quantity}</td>
                        <td className={`py-1.5 px-2 text-right font-mono text-xs ${tPnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {t.pnl ? (tPnl >= 0 ? "+" : "") + tPnl.toFixed(4) : "-"}
                        </td>
                        <td className="py-1.5 px-2 text-xs">{t.aiSignal || "-"}</td>
                        <td className="py-1.5 px-2"><Badge variant="outline" className="text-xs">{t.status}</Badge></td>
                        <td className="py-1.5 px-2 text-xs text-muted-foreground">{new Date(t.openedAt).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">No trades yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
