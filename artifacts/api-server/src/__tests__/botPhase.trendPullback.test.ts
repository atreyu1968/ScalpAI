import { describe, it, expect } from "vitest";
import { buildTrendPullbackPhase } from "../routes/ai";
import type { TrendPullbackDecision } from "../services/trendPullback";

function decision(reason: string): TrendPullbackDecision {
  return { signal: null, reason, details: {}, evaluatedAt: Date.now() };
}

describe("buildTrendPullbackPhase", () => {
  it("returns in_trade when there's an open trade regardless of decision", () => {
    const out = buildTrendPullbackPhase(decision("trend_not_bullish_4h"), true);
    expect(out.phase).toBe("in_trade");
    expect(out.label).toBe("En operación");
  });

  it("returns warming_up with friendly label when there's no decision yet", () => {
    const out = buildTrendPullbackPhase(undefined, false);
    expect(out.phase).toBe("warming_up");
    expect(out.label).toMatch(/Cargando datos de Binance/);
  });

  it("maps warming_up_4h to warming_up phase with 4H label", () => {
    const out = buildTrendPullbackPhase(decision("warming_up_4h"), false);
    expect(out.phase).toBe("warming_up");
    expect(out.label).toMatch(/4H/);
  });

  it("maps warming_up_1h to warming_up phase with 1H label", () => {
    const out = buildTrendPullbackPhase(decision("warming_up_1h"), false);
    expect(out.phase).toBe("warming_up");
    expect(out.label).toMatch(/1H/);
  });

  it("maps no_orderbook to warming_up (waiting for binance stream)", () => {
    const out = buildTrendPullbackPhase(decision("no_orderbook"), false);
    expect(out.phase).toBe("warming_up");
    expect(out.label).toMatch(/libro de órdenes/i);
  });

  it("maps limit_order_pending to waiting phase", () => {
    const out = buildTrendPullbackPhase(decision("limit_order_pending"), false);
    expect(out.phase).toBe("waiting");
    expect(out.label).toMatch(/límite pendiente/i);
  });

  it("maps limit_order_placed to waiting phase", () => {
    const out = buildTrendPullbackPhase(decision("limit_order_placed"), false);
    expect(out.phase).toBe("waiting");
  });

  it("maps trend_not_bullish_4h to scanning with explicit detail", () => {
    const out = buildTrendPullbackPhase(decision("trend_not_bullish_4h"), false);
    expect(out.phase).toBe("scanning");
    expect(out.label).toBe("Analizando");
    expect(out.detail).toMatch(/Tendencia 4H/);
  });

  it("maps no_pullback_to_ema50_1h to scanning with explicit detail", () => {
    const out = buildTrendPullbackPhase(decision("no_pullback_to_ema50_1h"), false);
    expect(out.phase).toBe("scanning");
    expect(out.detail).toMatch(/pullback/i);
  });

  it("maps rsi_out_of_range to scanning with explicit detail", () => {
    const out = buildTrendPullbackPhase(decision("rsi_out_of_range"), false);
    expect(out.phase).toBe("scanning");
    expect(out.detail).toMatch(/RSI/);
  });

  it("maps btc_correlation_drop to scanning with explicit detail", () => {
    const out = buildTrendPullbackPhase(decision("btc_correlation_drop"), false);
    expect(out.phase).toBe("scanning");
    expect(out.detail).toMatch(/BTC/);
  });

  it("maps signal_long to in_trade (transient state right before opening)", () => {
    const out = buildTrendPullbackPhase(decision("signal_long"), false);
    expect(out.phase).toBe("in_trade");
  });

  it("maps limit_order_filled to in_trade", () => {
    const out = buildTrendPullbackPhase(decision("limit_order_filled"), false);
    expect(out.phase).toBe("in_trade");
  });

  it("maps pair_not_supported to stopped phase", () => {
    const out = buildTrendPullbackPhase(decision("pair_not_supported"), false);
    expect(out.phase).toBe("stopped");
  });

  it("falls back to scanning with the raw reason as detail for unknown reasons", () => {
    const out = buildTrendPullbackPhase(decision("some_new_reason"), false);
    expect(out.phase).toBe("scanning");
    expect(out.detail).toBe("some_new_reason");
  });
});
