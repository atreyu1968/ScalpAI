import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMemo, useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface CandleResponse {
  symbol: string;
  timeframe: string;
  candles: OHLC[];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(1);
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(6);
}

const CANDLE_WIDTH = 7;
const WICK_WIDTH = 1;
const CHART_PADDING = { top: 16, right: 60, bottom: 28, left: 8 };

const themeColors = {
  dark: {
    grid: "hsl(220 15% 18%)",
    priceLabel: "hsl(220 15% 50%)",
    timeLabel: "hsl(220 15% 45%)",
    crosshair: "hsl(220 15% 40%)",
    tooltipBg: "hsl(220 25% 8%)",
    tooltipBorder: "hsl(220 20% 22%)",
    tooltipText: "hsl(220 15% 70%)",
    chartBg: "hsl(220, 25%, 6%)",
  },
  light: {
    grid: "hsl(220 15% 88%)",
    priceLabel: "hsl(220 10% 45%)",
    timeLabel: "hsl(220 10% 50%)",
    crosshair: "hsl(220 15% 70%)",
    tooltipBg: "hsl(0 0% 100%)",
    tooltipBorder: "hsl(220 15% 85%)",
    tooltipText: "hsl(220 15% 25%)",
    chartBg: "hsl(220, 20%, 98%)",
  },
};

function CandlestickRenderer({ candles, width, height, colors }: { candles: OHLC[]; width: number; height: number; colors: typeof themeColors.dark }) {
  const chartW = width - CHART_PADDING.left - CHART_PADDING.right;
  const chartH = height - CHART_PADDING.top - CHART_PADDING.bottom;

  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min) * 0.05 || max * 0.001;
    return { minPrice: min - padding, maxPrice: max + padding, priceRange: max - min + padding * 2 };
  }, [candles]);

  const yScale = (price: number) => CHART_PADDING.top + chartH - ((price - minPrice) / priceRange) * chartH;
  const xScale = (i: number) => CHART_PADDING.left + (i / Math.max(candles.length - 1, 1)) * chartW;

  const gridLines = useMemo(() => {
    const lines: number[] = [];
    const step = priceRange / 5;
    for (let i = 0; i <= 5; i++) {
      lines.push(minPrice + step * i);
    }
    return lines;
  }, [minPrice, priceRange]);

  const timeLabels = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(candles.length / 6));
    for (let i = 0; i < candles.length; i += step) {
      labels.push({ x: xScale(i), label: formatTime(candles[i].time) });
    }
    return labels;
  }, [candles, chartW]);

  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredCandle = hovered !== null ? candles[hovered] : null;

  return (
    <svg width={width} height={height} className="select-none">
      {gridLines.map((price, i) => (
        <g key={i}>
          <line x1={CHART_PADDING.left} y1={yScale(price)} x2={width - CHART_PADDING.right} y2={yScale(price)} stroke={colors.grid} strokeDasharray="2 4" />
          <text x={width - CHART_PADDING.right + 4} y={yScale(price) + 3} fill={colors.priceLabel} fontSize={9} fontFamily="monospace">
            {formatPrice(price)}
          </text>
        </g>
      ))}

      {timeLabels.map(({ x, label }, i) => (
        <text key={i} x={x} y={height - 6} fill={colors.timeLabel} fontSize={9} textAnchor="middle" fontFamily="monospace">
          {label}
        </text>
      ))}

      {candles.map((c, i) => {
        const x = xScale(i);
        const isBullish = c.close >= c.open;
        const bodyTop = yScale(Math.max(c.open, c.close));
        const bodyBottom = yScale(Math.min(c.open, c.close));
        const bodyH = Math.max(bodyBottom - bodyTop, 1);
        const wickTop = yScale(c.high);
        const wickBottom = yScale(c.low);
        const color = isBullish ? "hsl(160 100% 45%)" : "hsl(0 85% 55%)";

        return (
          <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: "crosshair" }}>
            <rect x={x - CANDLE_WIDTH / 2 - 2} y={CHART_PADDING.top} width={CANDLE_WIDTH + 4} height={chartH} fill="transparent" />
            <line x1={x} y1={wickTop} x2={x} y2={wickBottom} stroke={color} strokeWidth={WICK_WIDTH} />
            <rect x={x - CANDLE_WIDTH / 2} y={bodyTop} width={CANDLE_WIDTH} height={bodyH} fill={isBullish ? color : color} rx={1} />
          </g>
        );
      })}

      {hoveredCandle && hovered !== null && (
        <g>
          <line x1={xScale(hovered)} y1={CHART_PADDING.top} x2={xScale(hovered)} y2={CHART_PADDING.top + chartH} stroke={colors.crosshair} strokeDasharray="3 3" />
          <line x1={CHART_PADDING.left} y1={yScale(hoveredCandle.close)} x2={width - CHART_PADDING.right} y2={yScale(hoveredCandle.close)} stroke={colors.crosshair} strokeDasharray="3 3" />
        </g>
      )}

      {hoveredCandle && (
        <g>
          <rect x={CHART_PADDING.left + 4} y={CHART_PADDING.top} width={200} height={64} rx={4} fill={colors.tooltipBg} fillOpacity={0.95} stroke={colors.tooltipBorder} />
          <text x={CHART_PADDING.left + 10} y={CHART_PADDING.top + 14} fill={colors.tooltipText} fontSize={10} fontFamily="monospace">
            {formatTime(hoveredCandle.time)} — O:{formatPrice(hoveredCandle.open)} H:{formatPrice(hoveredCandle.high)}
          </text>
          <text x={CHART_PADDING.left + 10} y={CHART_PADDING.top + 28} fill={colors.tooltipText} fontSize={10} fontFamily="monospace">
            L:{formatPrice(hoveredCandle.low)} C:{formatPrice(hoveredCandle.close)}
          </text>
          <text x={CHART_PADDING.left + 10} y={CHART_PADDING.top + 42} fill={colors.tooltipText} fontSize={10} fontFamily="monospace">
            Vol: {hoveredCandle.volume.toFixed(4)}
          </text>
          <text x={CHART_PADDING.left + 10} y={CHART_PADDING.top + 56} fill={hoveredCandle.close >= hoveredCandle.open ? "hsl(160 100% 45%)" : "hsl(0 85% 55%)"} fontSize={10} fontFamily="monospace" fontWeight="bold">
            {hoveredCandle.close >= hoveredCandle.open ? "▲" : "▼"} {((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open * 100).toFixed(3)}%
          </text>
        </g>
      )}
    </svg>
  );
}

export function CandlestickChart({ symbol, height = 320 }: { symbol: string; height?: number }) {
  const { token } = useAuth();
  const { theme } = useTheme();
  const [timeframe, setTimeframe] = useState<"1m" | "5m">("1m");
  const colors = themeColors[theme];

  const cleanSymbol = symbol.replace("/", "").toLowerCase();

  const { data, isLoading } = useQuery<CandleResponse>({
    queryKey: ["/api/ai/candles", cleanSymbol, timeframe],
    queryFn: async () => {
      const res = await fetch(`/api/ai/candles/${cleanSymbol}?tf=${timeframe}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 5000,
  });

  const candles = data?.candles ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["1m", "5m"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                timeframe === tf
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {candles.length > 0 && (
          <span className="text-[10px] text-muted-foreground">{candles.length} velas</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height }}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : candles.length < 3 ? (
        <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
          Esperando velas... ({candles.length}/{timeframe === "1m" ? 50 : 10} mínimo)
        </div>
      ) : (
        <ChartContainer candles={candles} height={height} colors={colors} />
      )}
    </div>
  );
}

function ChartContainer({ candles, height, colors }: { candles: OHLC[]; height: number; colors: typeof themeColors.dark }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const chartWidth = Math.max(candles.length * (CANDLE_WIDTH + 3) + CHART_PADDING.left + CHART_PADDING.right, containerWidth);
  const needsScroll = chartWidth > containerWidth;

  useEffect(() => {
    if (scrollRef.current && needsScroll) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [candles.length, needsScroll]);

  return (
    <div ref={containerRef} className="w-full rounded-lg border border-border" style={{ backgroundColor: colors.chartBg }}>
      <div ref={scrollRef} className={needsScroll ? "overflow-x-auto" : "overflow-hidden"}>
        <CandlestickRenderer candles={candles} width={chartWidth} height={height} colors={colors} />
      </div>
    </div>
  );
}
