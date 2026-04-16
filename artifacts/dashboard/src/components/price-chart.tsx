import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, type IChartApi, type ISeriesApi, type CandlestickData, type Time, ColorType, CandlestickSeries } from "lightweight-charts";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMarketWs } from "@/hooks/use-market-ws";

interface TradeData {
  price: number;
  quantity: number;
  time: number;
  isBuyerMaker: boolean;
}

type TimeframeKey = "1s" | "5s" | "1m";
const TIMEFRAMES: { label: string; key: TimeframeKey; ms: number }[] = [
  { label: "1s", key: "1s", ms: 1000 },
  { label: "5s", key: "5s", ms: 5000 },
  { label: "1m", key: "1m", ms: 60000 },
];

function aggregateCandles(trades: TradeData[], intervalMs: number): CandlestickData[] {
  if (trades.length === 0) return [];
  const buckets = new Map<number, { open: number; high: number; low: number; close: number }>();

  for (const t of trades) {
    const bucketTime = Math.floor(t.time / intervalMs) * intervalMs;
    const existing = buckets.get(bucketTime);
    if (existing) {
      existing.high = Math.max(existing.high, t.price);
      existing.low = Math.min(existing.low, t.price);
      existing.close = t.price;
    } else {
      buckets.set(bucketTime, { open: t.price, high: t.price, low: t.price, close: t.price });
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, ohlc]) => ({
      time: (time / 1000) as Time,
      open: ohlc.open,
      high: ohlc.high,
      low: ohlc.low,
      close: ohlc.close,
    }));
}

const priceChartTheme = {
  dark: {
    textColor: "hsl(220, 15%, 60%)",
    gridColor: "hsl(220, 20%, 12%)",
  },
  light: {
    textColor: "hsl(220, 10%, 40%)",
    gridColor: "hsl(220, 15%, 90%)",
  },
};

export function PriceChart({ symbol }: { symbol: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const { token } = useAuth();
  const { theme } = useTheme();
  const [timeframe, setTimeframe] = useState<TimeframeKey>("5s");
  const tradesRef = useRef<TradeData[]>([]);
  const [tradeCount, setTradeCount] = useState(0);
  const timeframeRef = useRef<TimeframeKey>("5s");
  const lastBucketRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const renderThrottleRef = useRef<number>(0);

  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);

  const fetchInitialTrades = useCallback(async () => {
    if (!token || !symbol) return;
    try {
      const cleanSymbol = symbol.replace("/", "").toLowerCase();
      const res = await fetch(`/api/market/trades/${cleanSymbol}?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        tradesRef.current = data;
        initializedRef.current = false;
        lastBucketRef.current = null;
        setTradeCount(data.length);
      }
    } catch {}
  }, [token, symbol]);

  useEffect(() => {
    fetchInitialTrades();
  }, [fetchInitialTrades]);

  const handleTrade = useCallback((trade: TradeData) => {
    tradesRef.current.push(trade);
    if (tradesRef.current.length > 500) {
      tradesRef.current = tradesRef.current.slice(-400);
    }

    const series = seriesRef.current;
    if (!series || !initializedRef.current) {
      const now = Date.now();
      if (now - renderThrottleRef.current >= 200) {
        renderThrottleRef.current = now;
        setTradeCount(c => c + 1);
      }
      return;
    }

    const tf = TIMEFRAMES.find(t => t.key === timeframeRef.current)!;
    const bucketTime = Math.floor(trade.time / tf.ms) * tf.ms;
    const lastBucket = lastBucketRef.current;

    if (lastBucket !== null && bucketTime === lastBucket) {
      const last = tradesRef.current.filter(
        t => Math.floor(t.time / tf.ms) * tf.ms === bucketTime
      );
      const open = last[0].price;
      let high = open, low = open, close = open;
      for (const t of last) {
        if (t.price > high) high = t.price;
        if (t.price < low) low = t.price;
        close = t.price;
      }
      series.update({
        time: (bucketTime / 1000) as Time,
        open, high, low, close,
      });
    } else {
      series.update({
        time: (bucketTime / 1000) as Time,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
      });
      lastBucketRef.current = bucketTime;
    }
  }, []);

  const { connected } = useMarketWs({
    symbol,
    onTrade: handleTrade,
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const pTheme = priceChartTheme[theme];
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: pTheme.textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: pTheme.gridColor },
        horzLines: { color: pTheme.gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "hsl(160, 100%, 45%)",
      downColor: "hsl(0, 84%, 60%)",
      borderUpColor: "hsl(160, 100%, 45%)",
      borderDownColor: "hsl(0, 84%, 60%)",
      wickUpColor: "hsl(160, 100%, 35%)",
      wickDownColor: "hsl(0, 84%, 50%)",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [theme]);

  const hasInitialData = tradeCount > 0;
  useEffect(() => {
    if (!seriesRef.current || tradesRef.current.length === 0) return;
    const tf = TIMEFRAMES.find(t => t.key === timeframe)!;
    const candles = aggregateCandles(tradesRef.current, tf.ms);
    if (candles.length > 0) {
      seriesRef.current.setData(candles);
      const last = candles[candles.length - 1];
      lastBucketRef.current = (last.time as number) * 1000;
      initializedRef.current = true;
      chartRef.current?.timeScale().fitContent();
    }
  }, [timeframe, hasInitialData]);

  if (!symbol) return null;

  return (
    <div data-testid="price-chart">
      <div className="flex items-center gap-2 mb-2">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.key}
            onClick={() => setTimeframe(tf.key)}
            className={`px-2 py-0.5 text-xs rounded font-mono transition-colors ${
              timeframe === tf.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tf.label}
          </button>
        ))}
        <span className={`ml-auto text-[10px] ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>
          {connected ? "● EN VIVO" : "○ conectando..."}
        </span>
      </div>
      <div ref={chartContainerRef} className="w-full">
        {tradesRef.current.length === 0 && (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            <div className="text-center">
              <p>Sin datos de operaciones</p>
              <p className="text-xs mt-1">Inicia un bot en este par para ver el gráfico</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
