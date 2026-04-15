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
import { Plus, Play, Square, Skull, AlertTriangle, Trash2 } from "lucide-react";
import { BotPhaseInline } from "@/components/bot-phase-badge";

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
          toast({ title: "Bot creado" });
        },
        onError: (err: unknown) => {
          toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Error al crear bot", variant: "destructive" });
        },
      }
    );
  };

  const actionLabels: Record<string, string> = {
    start: "iniciado", stop: "detenido", kill: "eliminado forzosamente", delete: "eliminado"
  };

  const handleAction = (action: "start" | "stop" | "kill" | "delete", id: number) => {
    const mutations = { start: startBot, stop: stopBot, kill: killBot, delete: deleteBot };
    mutations[action].mutate(
      { id },
      {
        onSuccess: () => {
          invalidate();
          toast({ title: `Bot ${actionLabels[action]}` });
        },
        onError: (err: unknown) => {
          toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || `Error al ${action === "start" ? "iniciar" : action === "stop" ? "detener" : action === "kill" ? "forzar cierre" : "eliminar"}`, variant: "destructive" });
        },
      }
    );
  };

  const handleKillAll = () => {
    if (!confirm("¿Detener TODOS los bots en ejecución? Esto cerrará todas las posiciones abiertas.")) return;
    killAll.mutate(undefined, {
      onSuccess: (res) => {
        invalidate();
        toast({ title: `${res.stopped} bots detenidos` });
      },
    });
  };


  return (
    <div className="space-y-6" data-testid="bots-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bots</h1>
          <p className="text-muted-foreground">Gestiona tus bots de trading</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleKillAll} disabled={killAll.isPending} data-testid="button-kill-all">
            <Skull className="h-4 w-4 mr-1" /> Detener Todos
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-bot"><Plus className="h-4 w-4 mr-1" /> Nuevo Bot</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Crear Bot</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="input-bot-name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Par</Label>
                    <Select value={form.pair} onValueChange={(v) => setForm({ ...form, pair: v })}>
                      <SelectTrigger data-testid="input-bot-pair"><SelectValue placeholder="Seleccionar par" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BTC/USDT">BTC/USDT</SelectItem>
                        <SelectItem value="ETH/USDT">ETH/USDT</SelectItem>
                        <SelectItem value="BNB/USDT">BNB/USDT</SelectItem>
                        <SelectItem value="SOL/USDT">SOL/USDT</SelectItem>
                        <SelectItem value="XRP/USDT">XRP/USDT</SelectItem>
                        <SelectItem value="DOGE/USDT">DOGE/USDT</SelectItem>
                        <SelectItem value="ADA/USDT">ADA/USDT</SelectItem>
                        <SelectItem value="AVAX/USDT">AVAX/USDT</SelectItem>
                        <SelectItem value="DOT/USDT">DOT/USDT</SelectItem>
                        <SelectItem value="LINK/USDT">LINK/USDT</SelectItem>
                        <SelectItem value="MATIC/USDT">MATIC/USDT</SelectItem>
                        <SelectItem value="UNI/USDT">UNI/USDT</SelectItem>
                        <SelectItem value="ATOM/USDT">ATOM/USDT</SelectItem>
                        <SelectItem value="LTC/USDT">LTC/USDT</SelectItem>
                        <SelectItem value="FIL/USDT">FIL/USDT</SelectItem>
                        <SelectItem value="NEAR/USDT">NEAR/USDT</SelectItem>
                        <SelectItem value="APT/USDT">APT/USDT</SelectItem>
                        <SelectItem value="ARB/USDT">ARB/USDT</SelectItem>
                        <SelectItem value="OP/USDT">OP/USDT</SelectItem>
                        <SelectItem value="SUI/USDT">SUI/USDT</SelectItem>
                        <SelectItem value="PEPE/USDT">PEPE/USDT</SelectItem>
                        <SelectItem value="WIF/USDT">WIF/USDT</SelectItem>
                        <SelectItem value="RENDER/USDT">RENDER/USDT</SelectItem>
                        <SelectItem value="INJ/USDT">INJ/USDT</SelectItem>
                        <SelectItem value="TIA/USDT">TIA/USDT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Modo</Label>
                    <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v as "paper" | "live" })}>
                      <SelectTrigger data-testid="select-bot-mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paper">Simulado</SelectItem>
                        <SelectItem value="live">Real</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Apalancamiento</Label>
                    <Input type="number" min={1} max={125} value={form.leverage} onChange={(e) => setForm({ ...form, leverage: parseInt(e.target.value) || 1 })} data-testid="input-bot-leverage" />
                  </div>
                  <div className="space-y-2">
                    <Label>Capital (USDT)</Label>
                    <Input value={form.capitalAllocated} onChange={(e) => setForm({ ...form, capitalAllocated: e.target.value })} data-testid="input-bot-capital" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Confianza IA</Label>
                    <Input value={form.aiConfidenceThreshold} onChange={(e) => setForm({ ...form, aiConfidenceThreshold: e.target.value })} data-testid="input-bot-confidence" />
                  </div>
                  <div className="space-y-2">
                    <Label>Stop Loss (Pérdida Máx.) %</Label>
                    <Input value={form.stopLossPercent} onChange={(e) => setForm({ ...form, stopLossPercent: e.target.value })} data-testid="input-bot-stoploss" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Pérdida Máx. Diaria %</Label>
                  <Input value={form.maxDailyDrawdownPercent} onChange={(e) => setForm({ ...form, maxDailyDrawdownPercent: e.target.value })} data-testid="input-bot-drawdown" />
                </div>
                <Button type="submit" className="w-full" disabled={createBot.isPending} data-testid="button-submit-bot">
                  {createBot.isPending ? "Creando..." : "Crear Bot"}
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
                          <Badge variant={bot.mode === "live" ? "default" : "secondary"} className="text-xs">{bot.mode === "live" ? "real" : "simulado"}</Badge>
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
                        <BotPhaseInline botId={bot.id} botStatus={bot.status} />
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
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm("¿Eliminar este bot?")) handleAction("delete", bot.id); }} data-testid={`button-delete-${bot.id}`}>
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
            <h3 className="text-lg font-semibold">Sin bots aún</h3>
            <p className="text-muted-foreground text-sm mt-1">Crea tu primer bot de trading para comenzar</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
