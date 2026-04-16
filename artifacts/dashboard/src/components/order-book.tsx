import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketWs } from "@/hooks/use-market-ws";

interface OrderLevel {
  price: number;
  quantity: number;
}

interface OrderBookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
}

const THROTTLE_MS = 250;

export function OrderBookVisualizer({ symbol }: { symbol: string }) {
  const { token } = useAuth();
  const [data, setData] = useState<OrderBookData | null>(null);
  const latestRef = useRef<OrderBookData | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInitial = useCallback(async () => {
    if (!token || !symbol) return;
    try {
      const cleanSymbol = symbol.replace("/", "").toLowerCase();
      const res = await fetch(`/api/market/orderbook/${cleanSymbol}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      console.warn("[OrderBook] Error fetching initial data:", e);
    }
  }, [token, symbol]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, []);

  const handleOrderBook = useCallback((ob: OrderBookData) => {
    latestRef.current = ob;
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;
    if (elapsed >= THROTTLE_MS) {
      lastUpdateRef.current = now;
      setData(ob);
    } else if (!pendingTimerRef.current) {
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        lastUpdateRef.current = Date.now();
        if (latestRef.current) setData(latestRef.current);
      }, THROTTLE_MS - elapsed);
    }
  }, []);

  const { connected } = useMarketWs({
    symbol,
    onOrderBook: handleOrderBook,
  });

  if (!data || (data.bids.length === 0 && data.asks.length === 0)) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <p>Sin datos de libro de órdenes</p>
        <p className="text-xs mt-1">Inicia un bot en este par para ver la profundidad</p>
      </div>
    );
  }

  const maxQty = Math.max(
    ...data.bids.map(l => l.quantity),
    ...data.asks.map(l => l.quantity),
    1
  );

  return (
    <div data-testid="order-book">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Profundidad (top 10 niveles)</span>
        <span className={`text-[10px] ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>
          {connected ? "● EN VIVO" : "○ conectando..."}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div>
          <div className="flex justify-between text-muted-foreground mb-1 px-1">
            <span>Compra</span><span>Cant.</span>
          </div>
          {data.bids.slice(0, 10).map((level, i) => (
            <div key={i} className="relative flex justify-between px-1 py-0.5">
              <div
                className="absolute inset-0 bg-emerald-500/10 rounded-sm"
                style={{ width: `${(level.quantity / maxQty) * 100}%` }}
              />
              <span className="relative text-emerald-400">{level.price.toFixed(2)}</span>
              <span className="relative text-muted-foreground">{level.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between text-muted-foreground mb-1 px-1">
            <span>Venta</span><span>Cant.</span>
          </div>
          {data.asks.slice(0, 10).map((level, i) => (
            <div key={i} className="relative flex justify-between px-1 py-0.5">
              <div
                className="absolute inset-0 right-0 bg-red-500/10 rounded-sm"
                style={{ width: `${(level.quantity / maxQty) * 100}%`, marginLeft: "auto" }}
              />
              <span className="relative text-red-400">{level.price.toFixed(2)}</span>
              <span className="relative text-muted-foreground">{level.quantity.toFixed(4)}</span>
            </div>
          ))}
        </div>
        <div className="col-span-2 text-center text-[10px] text-muted-foreground pt-1">
          Diferencial: {data.asks.length > 0 && data.bids.length > 0
            ? ((data.asks[0].price - data.bids[0].price) / data.bids[0].price * 10000).toFixed(1) + " bps"
            : "N/D"
          }
        </div>
      </div>
    </div>
  );
}
