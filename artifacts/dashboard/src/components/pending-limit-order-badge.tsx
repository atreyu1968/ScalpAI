import { useEffect, useState } from "react";
import type { PendingOrderSummary } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Hourglass, CheckCircle2, XCircle } from "lucide-react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function PendingLimitOrderBadge({ summary }: { summary: PendingOrderSummary }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (summary.status !== "pending") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [summary.status]);

  if (summary.status === "pending") {
    const remainingMs =
      summary.expiresAt != null
        ? Math.max(0, summary.expiresAt - now)
        : summary.remainingMs ?? 0;
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px] gap-1"
        data-testid={`badge-pending-order-${summary.botId}`}
      >
        <Hourglass className="h-3 w-3 animate-pulse" />
        Orden límite: {formatRemaining(remainingMs)}
      </Badge>
    );
  }

  if (summary.status === "filled") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] gap-1"
        data-testid={`badge-pending-order-${summary.botId}`}
      >
        <CheckCircle2 className="h-3 w-3" />
        Última: llena
      </Badge>
    );
  }

  if (summary.status === "expired") {
    return (
      <Badge
        variant="outline"
        className="border-red-500/40 bg-red-500/10 text-red-400 text-[10px] gap-1"
        data-testid={`badge-pending-order-${summary.botId}`}
      >
        <XCircle className="h-3 w-3" />
        Última: expirada
      </Badge>
    );
  }

  return null;
}
