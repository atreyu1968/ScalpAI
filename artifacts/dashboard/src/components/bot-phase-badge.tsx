import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Clock, Search, Zap, Pause, Square, Flame, TrendingUp, TrendingDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface BotPhaseData {
  phase: string;
  label: string;
  detail?: string;
  progress?: number;
  remainingMinutes?: number;
  trend?: string;
  emaAlignment?: string;
  adx?: number;
  regime?: string;
  candles1m: number;
  candles5m: number;
  requiredCandles: number;
}

const phaseConfig: Record<string, { icon: typeof Loader2; bg: string; text: string; border: string; animate?: boolean }> = {
  warming_up: { icon: Flame, bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30", animate: true },
  waiting: { icon: Clock, bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  scanning: { icon: Search, bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", animate: true },
  in_trade: { icon: Zap, bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30", animate: true },
  paused: { icon: Pause, bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  stopped: { icon: Square, bg: "bg-zinc-500/15", text: "text-zinc-400", border: "border-zinc-500/30" },
};

function useBotPhase(botId: number, enabled: boolean) {
  const { token } = useAuth();
  return useQuery<BotPhaseData>({
    queryKey: ["/api/ai/bot-phase", botId],
    queryFn: async () => {
      const res = await fetch(`/api/ai/bot-phase/${botId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch bot phase");
      return res.json();
    },
    enabled: enabled && !!token,
    refetchInterval: 10000,
  });
}

export function BotPhaseBadge({ botId, botStatus, size = "normal" }: { botId: number; botStatus: string; size?: "compact" | "normal" | "detailed" }) {
  const isRunning = botStatus === "running";
  const { data: phase } = useBotPhase(botId, isRunning);

  if (!isRunning) {
    const cfg = phaseConfig[botStatus] || phaseConfig.stopped;
    const Icon = cfg.icon;
    const label = botStatus === "paused" ? "Pausado" : "Detenido";
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        <Icon className="h-3 w-3" />
        {label}
      </span>
    );
  }

  if (!phase) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border bg-zinc-500/15 text-zinc-400 border-zinc-500/30">
        <Loader2 className="h-3 w-3 animate-spin" />
        Cargando...
      </span>
    );
  }

  const cfg = phaseConfig[phase.phase] || phaseConfig.stopped;
  const Icon = cfg.icon;

  if (size === "compact") {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
        <Icon className={`h-3 w-3 ${cfg.animate ? "animate-pulse" : ""}`} />
        {phase.label}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${cfg.text} ${cfg.animate ? "animate-pulse" : ""}`} />
        <span className={`text-sm font-bold ${cfg.text}`}>{phase.label}</span>
        {phase.phase === "scanning" && phase.trend && (
          <span className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
            {phase.trend === "up" ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : phase.trend === "down" ? <TrendingDown className="h-3 w-3 text-red-400" /> : null}
            {phase.emaAlignment === "bullish" ? "Alcista" : phase.emaAlignment === "bearish" ? "Bajista" : "Mixto"}
            {phase.adx ? ` · ADX ${phase.adx.toFixed(0)}` : ""}
          </span>
        )}
      </div>

      {phase.detail && (
        <p className="text-xs text-muted-foreground mt-1">{phase.detail}</p>
      )}

      {phase.phase === "warming_up" && phase.progress !== undefined && (
        <div className="mt-2 space-y-1">
          <Progress value={phase.progress} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{phase.candles1m}/{phase.requiredCandles} velas</span>
            <span>~{phase.remainingMinutes} min restantes</span>
          </div>
        </div>
      )}

      {size === "detailed" && phase.phase !== "warming_up" && phase.phase !== "stopped" && (
        <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>Velas 1m: {phase.candles1m}</span>
          <span>Velas 5m: {phase.candles5m}</span>
          {phase.regime && <span>Régimen: {phase.regime}</span>}
        </div>
      )}
    </div>
  );
}

export function BotPhaseInline({ botId, botStatus }: { botId: number; botStatus: string }) {
  return <BotPhaseBadge botId={botId} botStatus={botStatus} size="compact" />;
}
