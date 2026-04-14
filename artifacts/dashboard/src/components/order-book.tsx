import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface OrderLevel {
  price: number;
  quantity: number;
}

interface OrderBookData {
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastUpdateId: number;
  timestamp: number;
}

export function OrderBookVisualizer({ symbol }: { symbol: string }) {
  const { token } = useAuth();
  const [data, setData] = useState<OrderBookData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderBook = useCallback(async () => {
    if (!token || !symbol) return;
    try {
      const cleanSymbol = symbol.replace("/", "").toLowerCase();
      const res = await fetch(`/api/market/orderbook/${cleanSymbol}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setError(null);
      }
    } catch {
      setError("Failed to load order book");
    }
  }, [token, symbol]);

  useEffect(() => {
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 2000);
    return () => clearInterval(interval);
  }, [fetchOrderBook]);

  if (error) return <p className="text-xs text-muted-foreground text-center py-4">{error}</p>;
  if (!data || (data.bids.length === 0 && data.asks.length === 0)) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        <p>No order book data available</p>
        <p className="text-xs mt-1">Start a bot on this pair to see live depth</p>
      </div>
    );
  }

  const maxQty = Math.max(
    ...data.bids.map(l => l.quantity),
    ...data.asks.map(l => l.quantity),
    1
  );

  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono" data-testid="order-book">
      <div>
        <div className="flex justify-between text-muted-foreground mb-1 px-1">
          <span>Price</span><span>Qty</span>
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
          <span>Price</span><span>Qty</span>
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
        Spread: {data.asks.length > 0 && data.bids.length > 0
          ? ((data.asks[0].price - data.bids[0].price) / data.bids[0].price * 10000).toFixed(1) + " bps"
          : "N/A"
        }
      </div>
    </div>
  );
}
