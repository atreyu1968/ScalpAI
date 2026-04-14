import type { Bot } from "@workspace/db";
import { dataProcessor, type MarketSnapshot } from "./dataProcessor";
import type { TradeSignal } from "./botManager";
import { logger } from "../lib/logger";

const DEEPSEEK_MODEL = "deepseek/deepseek-chat-v3.1";
const DEFAULT_BATCH_INTERVAL_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

interface AISignalResult {
  action: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  reasoning: string;
}

interface SentimentState {
  pair: string;
  lastSignal: AISignalResult | null;
  lastSnapshot: MarketSnapshot | null;
  lastAnalysisAt: number | null;
  analysisCount: number;
  errorCount: number;
  lastError: string | null;
}

const SYSTEM_PROMPT = `You are an expert crypto scalp trader AI. Analyze the provided market data and decide whether to go LONG, SHORT, or HOLD.

You MUST respond with ONLY a JSON object in this exact format:
{"action":"LONG"|"SHORT"|"HOLD","confidence":0-100,"reasoning":"brief explanation"}

Decision factors:
- Order book volume imbalance (positive = more buy pressure)
- Bid/ask spread (tight = liquid, wide = risky)
- Recent trade buy/sell ratio
- RSI (>70 overbought, <30 oversold)
- Price momentum (1-minute change)
- Volatility (higher = more opportunity but more risk)

Rules:
- Only signal LONG/SHORT with confidence >60%
- HOLD when signals are mixed or uncertain
- Consider spread cost — avoid signals when spread is too wide
- Factor in volume imbalance direction for signal confirmation`;

class SignalService {
  private sentimentMap: Map<string, SentimentState> = new Map();
  private lastCallTime: Map<string, number> = new Map();
  private batchIntervalMs: number = DEFAULT_BATCH_INTERVAL_MS;

  async generateSignal(bot: Bot): Promise<TradeSignal | null> {
    const useFutures = bot.mode === "live" && bot.leverage > 1;
    const snapshot = dataProcessor.buildSnapshot(bot.pair, useFutures);

    if (!snapshot) {
      logger.debug({ botId: bot.id, pair: bot.pair }, "No market data available for signal generation");
      return null;
    }

    const pairKey = bot.pair;
    const now = Date.now();
    const lastCall = this.lastCallTime.get(pairKey) ?? 0;
    if (now - lastCall < this.batchIntervalMs) {
      const cached = this.sentimentMap.get(pairKey);
      if (cached?.lastSignal) {
        return this.convertToTradeSignal(cached.lastSignal);
      }
      return null;
    }

    this.lastCallTime.set(pairKey, now);

    try {
      const signal = await this.callDeepSeek(snapshot);

      const state = this.getOrCreateState(pairKey);
      state.lastSignal = signal;
      state.lastSnapshot = snapshot;
      state.lastAnalysisAt = now;
      state.analysisCount++;
      state.lastError = null;

      logger.info(
        { pair: pairKey, action: signal.action, confidence: signal.confidence },
        "AI signal generated",
      );

      return this.convertToTradeSignal(signal);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const state = this.getOrCreateState(pairKey);
      state.errorCount++;
      state.lastError = message;

      logger.error({ err, pair: pairKey }, "Failed to generate AI signal");
      return null;
    }
  }

  private async callDeepSeek(snapshot: MarketSnapshot): Promise<AISignalResult> {
    const { openrouter } = await import("@workspace/integrations-openrouter-ai");

    const userMessage = this.buildPrompt(snapshot);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await openrouter.chat.completions.create(
          {
            model: DEEPSEEK_MODEL,
            max_tokens: 256,
            temperature: 0.1,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userMessage },
            ],
          },
          { signal: controller.signal },
        );

        clearTimeout(timeout);

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from DeepSeek");
        }

        return this.parseSignalResponse(content);
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("Failed after retries");
  }

  private buildPrompt(snapshot: MarketSnapshot): string {
    const ob = snapshot.orderBook;
    const trades = snapshot.recentTrades;
    const ind = snapshot.indicators;

    return `Market Data for ${snapshot.pair} at ${new Date(snapshot.timestamp).toISOString()}:

ORDER BOOK:
- Best Bid: ${ob.bestBid.toFixed(2)} | Best Ask: ${ob.bestAsk.toFixed(2)}
- Spread: ${ob.spread.toFixed(4)} (${ob.spreadBps.toFixed(1)} bps)
- Bid Depth: $${ob.bidDepth.toFixed(0)} | Ask Depth: $${ob.askDepth.toFixed(0)}
- Volume Imbalance: ${(ob.volumeImbalance * 100).toFixed(1)}% (positive = buy pressure)
- Top 5 Bids: ${ob.topBids.map((b) => `${b.price}×${b.quantity.toFixed(4)}`).join(", ")}
- Top 5 Asks: ${ob.topAsks.map((a) => `${a.price}×${a.quantity.toFixed(4)}`).join(", ")}

RECENT TRADES (last ${trades.count}):
- Avg Price: ${trades.avgPrice.toFixed(2)} | VWAP: ${trades.vwap.toFixed(2)}
- Buy Volume: ${trades.buyVolume.toFixed(4)} | Sell Volume: ${trades.sellVolume.toFixed(4)}
- Buy Ratio: ${(trades.buyRatio * 100).toFixed(1)}%

INDICATORS:
- RSI(14): ${ind.rsi !== null ? ind.rsi.toFixed(1) : "N/A"}
- 1min Price Change: ${ind.priceChange1m !== null ? ind.priceChange1m.toFixed(3) + "%" : "N/A"}
- Volatility: ${ind.volatility !== null ? ind.volatility.toFixed(4) + "%" : "N/A"}

Respond with JSON only.`;
  }

  private parseSignalResponse(content: string): AISignalResult {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Could not parse JSON from response: ${content.slice(0, 200)}`);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const action = String(parsed.action).toUpperCase();
    if (action !== "LONG" && action !== "SHORT" && action !== "HOLD") {
      throw new Error(`Invalid action: ${action}`);
    }

    const confidence = Number(parsed.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 100) {
      throw new Error(`Invalid confidence: ${parsed.confidence}`);
    }

    return {
      action: action as "LONG" | "SHORT" | "HOLD",
      confidence,
      reasoning: String(parsed.reasoning || ""),
    };
  }

  private convertToTradeSignal(signal: AISignalResult): TradeSignal | null {
    if (signal.action === "HOLD") return null;

    return {
      side: signal.action === "LONG" ? "long" : "short",
      confidence: signal.confidence,
      signal: `${signal.action}: ${signal.reasoning}`,
    };
  }

  private getOrCreateState(pair: string): SentimentState {
    let state = this.sentimentMap.get(pair);
    if (!state) {
      state = {
        pair,
        lastSignal: null,
        lastSnapshot: null,
        lastAnalysisAt: null,
        analysisCount: 0,
        errorCount: 0,
        lastError: null,
      };
      this.sentimentMap.set(pair, state);
    }
    return state;
  }

  getSentiment(pair: string): SentimentState | null {
    return this.sentimentMap.get(pair) ?? null;
  }

  getAllSentiments(): SentimentState[] {
    return Array.from(this.sentimentMap.values());
  }

  setBatchInterval(ms: number): void {
    this.batchIntervalMs = Math.max(500, ms);
  }

  getBatchInterval(): number {
    return this.batchIntervalMs;
  }
}

export const signalService = new SignalService();
