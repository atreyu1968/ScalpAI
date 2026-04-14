import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  useListBots, useCreateBot, useStartBot, useStopBot, useKillBot, useKillAllBots, useDeleteBot,
  getListBotsQueryKey
} from "@workspace/api-client-react";
import type { CreateBotBody } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Square, Skull, AlertTriangle, Trash2, CircleDot } from "lucide-react";

export default function BotsPage() {
  const { data: bots, isLoading } = useListBots();
  const createBot = useCreateBot();
  const startBot = useStartBot();
  const stopBot = useStopBot();
  const killBot = useKillBot();
  const killAll = useKillAllBots();
  const deleteBot = useDeleteBot();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState<CreateBotBody>({
    name: "",
    pair: "BTC/USDT",
    mode: "paper",
    leverage: 1,
    capitalAllocated: "100",
    aiConfidenceThreshold: "0.7",
    stopLossPercent: "2",
    maxDailyDrawdownPercent: "5",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: getListBotsQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createBot.mutate(
      { data: form },
      {
        onSuccess: () => {
          invalidate();
          setOpen(false);
          setForm({ ...form, name: "" });
          toast({ title: "Bot created" });
        },
        onError: (err: unknown) => {
          toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Failed to create bot", variant: "destructive" });
        },
      }
    );
  };

  const handleAction = (action: "start" | "stop" | "kill" | "delete", id: number) => {
    const mutations = { start: startBot, stop: stopBot, kill: killBot, delete: deleteBot };
    mutations[action].mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: `Bot ${action}${action === "stop" ? "p" : ""}ed` });
        },
        onError: (err: unknown) => {
          toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || `Failed to ${action}`, variant: "destructive" });
        },
      }
    );
  };

  const handleKillAll = () => {
    if (!confirm("Kill ALL running bots? This will close all open positions.")) return;
    killAll.mutate(undefined, {
      onSuccess: (res) => {
        invalidate();
        toast({ title: `${res.stopped} bots killed` });
      },
    });
  };

  const statusColors: Record<string, string> = {
    running: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    stopped: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="space-y-6" data-testid="bots-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bots</h1>
          <p className="text-muted-foreground">Manage your trading bots</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleKillAll} disabled={killAll.isPending} data-testid="button-kill-all">
            <Skull className="h-4 w-4 mr-1" /> Kill All
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-bot"><Plus className="h-4 w-4 mr-1" /> New Bot</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Bot</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-bot-name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pair</Label>
                    <Input value={form.pair} onChange={(e) => setForm({ ...form, pair: e.target.value.toUpperCase() })} placeholder="BTC/USDT" data-testid="input-bot-pair" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mode</Label>
                    <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as "paper" | "live" })}>
                      <SelectTrigger data-testid="select-bot-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paper">Paper</SelectItem>
                        <SelectItem value="live">Live</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Leverage</Label>
                    <Input type="number" min={1} max={125} value={form.leverage} onChange={(e) => setForm({ ...form, leverage: parseInt(e.target.value) || 1 })} data-testid="input-bot-leverage" />
                  </div>
                  <div className="space-y-2">
                    <Label>Capital (USDT)</Label>
                    <Input value={form.capitalAllocated} onChange={(e) => setForm({ ...form, capitalAllocated: e.target.value })} data-testid="input-bot-capital" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AI Confidence</Label>
                    <Input value={form.aiConfidenceThreshold} onChange={(e) => setForm({ ...form, aiConfidenceThreshold: e.target.value })} data-testid="input-bot-confidence" />
                  </div>
                  <div className="space-y-2">
                    <Label>Stop Loss %</Label>
                    <Input value={form.stopLossPercent} onChange={(e) => setForm({ ...form, stopLossPercent: e.target.value })} data-testid="input-bot-stoploss" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Max Daily Drawdown %</Label>
                  <Input value={form.maxDailyDrawdownPercent} onChange={(e) => setForm({ ...form, maxDailyDrawdownPercent: e.target.value })} data-testid="input-bot-drawdown" />
                </div>
                <Button type="submit" className="w-full" disabled={createBot.isPending} data-testid="button-submit-bot">
                  {createBot.isPending ? "Creating..." : "Create Bot"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : bots && bots.length > 0 ? (
        <div className="grid gap-4">
          {bots.map((bot) => {
            const pnl = parseFloat(bot.dailyPnl || "0");
            return (
              <Card key={bot.id} className="hover:border-primary/30 transition-colors cursor-pointer" data-testid={`card-bot-${bot.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1" onClick={() => setLocation(`/bots/${bot.id}`)}>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{bot.name}</h3>
                          <Badge variant={bot.mode === "live" ? "default" : "secondary"} className="text-xs">{bot.mode}</Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="font-mono">{bot.pair}</span>
                          <span>{bot.leverage}x</span>
                          <span>{bot.capitalAllocated} USDT</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusColors[bot.status] || statusColors.stopped}`}>
                          <CircleDot className="h-3 w-3 mr-1" />{bot.status}
                        </span>
                        <p className={`text-sm font-mono mt-1 ${pnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {bot.status !== "running" ? (
                          <Button size="sm" variant="ghost" onClick={() => handleAction("start", bot.id)} data-testid={`button-start-${bot.id}`}>
                            <Play className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => handleAction("stop", bot.id)} data-testid={`button-stop-${bot.id}`}>
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleAction("kill", bot.id)} data-testid={`button-kill-${bot.id}`}>
                          <Skull className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("Delete this bot?")) handleAction("delete", bot.id); }} data-testid={`button-delete-${bot.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No bots yet</h3>
            <p className="text-muted-foreground text-sm mt-1">Create your first trading bot to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
