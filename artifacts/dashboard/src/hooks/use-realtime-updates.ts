import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface TradingEvent {
  type: string;
  userId: number;
  botId: number;
  tradeId?: number;
  data?: Record<string, unknown>;
}

export function useRealtimeUpdates() {
  const { token, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intentionalClose = useRef(false);

  const handleEvent = useCallback((event: TradingEvent) => {
    switch (event.type) {
      case "trade_opened":
      case "trade_closed":
        queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
        break;
      case "tp_hit":
        queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
        break;
      case "bot_started":
      case "bot_stopped":
      case "bot_paused":
        queryClient.invalidateQueries({ queryKey: ["/api/bots"] });
        break;
    }
  }, [queryClient]);

  const connect = useCallback(() => {
    if (!token || !isAuthenticated) return;

    intentionalClose.current = false;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/market?token=${encodeURIComponent(token)}`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "trading_event" && msg.event) {
          handleEvent(msg.event as TradingEvent);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (!intentionalClose.current) {
        reconnectTimer.current = setTimeout(connect, 5000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [token, isAuthenticated, handleEvent]);

  useEffect(() => {
    connect();
    return () => {
      intentionalClose.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);
}
