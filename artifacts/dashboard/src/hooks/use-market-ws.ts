import { useEffect, useRef, useCallback, useState } from "react";

interface TradeEvent {
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

interface OrderBookLevel {
  price: number;
  quantity: number;
}

interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

type WsMessage =
  | { type: "trade"; symbol: string; data: TradeEvent }
  | { type: "orderbook"; symbol: string; data: OrderBookSnapshot }
  | { type: "subscribed"; symbol: string };

interface UseMarketWsOptions {
  symbol: string;
  onTrade?: (trade: TradeEvent) => void;
  onOrderBook?: (ob: OrderBookSnapshot) => void;
}

export function useMarketWs({ symbol, onTrade, onOrderBook }: UseMarketWsOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const intentionalClose = useRef(false);
  const [connected, setConnected] = useState(false);
  const onTradeRef = useRef(onTrade);
  const onOrderBookRef = useRef(onOrderBook);

  onTradeRef.current = onTrade;
  onOrderBookRef.current = onOrderBook;

  const connect = useCallback(() => {
    if (!symbol) return;

    intentionalClose.current = false;
    const cleanSymbol = symbol.replace("/", "").toLowerCase();
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/market`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ action: "subscribe", symbol: cleanSymbol }));
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        if (msg.type === "trade") {
          onTradeRef.current?.(msg.data);
        } else if (msg.type === "orderbook") {
          onOrderBookRef.current?.(msg.data);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      if (!intentionalClose.current) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [symbol]);

  useEffect(() => {
    connect();
    return () => {
      intentionalClose.current = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { connected };
}
