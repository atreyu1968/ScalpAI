import type { Bot } from "@workspace/db";
import { dataProcessor, type MarketSnapshot } from "./dataProcessor";
import type { TradeSignal } from "./botManager";
import { logger } from "../lib/logger";

const DEFAULT_BATCH_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const CONSECUTIVE_ERROR_PAUSE_THRESHOLD = 3;

interface AISignalResult {
  action: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  reasoning: string;
  takeProfitPct?: number;
  tp1Pct?: number;
  tp2Pct?: number;
  tp3Pct?: number;
}

interface SentimentState {
  pair: string;
  lastSignal: AISignalResult | null;
  lastSnapshot: MarketSnapshot | null;
  lastAnalysisAt: number | null;
  analysisCount: number;
  errorCount: number;
  consecutiveErrors: number;
  lastError: string | null;
}

export interface ProviderPreset {
  provider: string;
  label: string;
  baseUrl: string;
  model: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    provider: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    inputCostPer1M: 0.27,
    outputCostPer1M: 1.10,
  },
  openai: {
    provider: "openai",
    label: "GPT-4o (OpenAI)",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
    inputCostPer1M: 2.50,
    outputCostPer1M: 10.00,
  },
  gemini: {
    provider: "gemini",
    label: "Gemini 2.0 Flash (Google)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.0-flash",
    inputCostPer1M: 0.10,
    outputCostPer1M: 0.40,
  },
  qwen: {
    provider: "qwen",
    label: "Qwen (Alibaba)",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    inputCostPer1M: 0.80,
    outputCostPer1M: 2.00,
  },
};

const SYSTEM_PROMPT = `Eres una IA experta en scalping de criptomonedas usando la Fórmula Perfecta de Take Profit. Analiza los datos de mercado proporcionados y decide si abrir LONG, SHORT o mantener HOLD.

DEBES responder SOLO con un objeto JSON en este formato exacto:
{"action":"LONG"|"SHORT"|"HOLD","confidence":0-100,"takeProfitPct":0.5-2.0,"reasoning":"explicación breve en español"}

Estrategia de entrada (Fórmula Perfecta):
- LONG cuando: desequilibrio de volumen positivo fuerte + RSI < 30 (sobreventa) + momentum alcista
- SHORT cuando: desequilibrio de volumen negativo fuerte + RSI > 70 (sobrecompra) + momentum bajista
- HOLD cuando: señales mixtas, RSI neutro (30-70), o spread demasiado amplio

Factores de decisión:
- Desequilibrio de volumen en el libro de órdenes (positivo = más presión compradora)
- Spread bid/ask (ajustado = líquido, amplio = arriesgado)
- Ratio compra/venta de operaciones recientes
- RSI (>70 sobrecomprado = buscar SHORT, <30 sobrevendido = buscar LONG)
- Momentum del precio (cambio en 1 minuto)
- Volatilidad (mayor = TP más alto, menor = TP más conservador)

Reglas:
- Solo señalar LONG/SHORT con confianza >60%
- HOLD cuando las señales son mixtas o inciertas
- Considerar el coste del spread — evitar señales cuando el spread es demasiado amplio
- Confirmar la dirección con el desequilibrio de volumen
- takeProfitPct: porcentaje de ganancia objetivo (entre 0.5% y 2.0%)
  - Baja volatilidad + señal moderada → TP conservador (0.5%-1.0%)
  - Alta volatilidad + señal fuerte → TP agresivo (1.0%-2.0%)
  - Para HOLD, usar 0`;

class SignalService {
  private sentimentMap: Map<string, SentimentState> = new Map();
  private lastCallTime: Map<string, number> = new Map();
  private batchIntervalMs: number = DEFAULT_BATCH_INTERVAL_MS;
  private pauseCallback: ((botId: number, reason: string) => Promise<void>) | null = null;
  private dailyInputTokens: number = 0;
  private dailyOutputTokens: number = 0;
  private dailyCostUsd: number = 0;
  private dailyCallCount: number = 0;
  private costResetDate: string = new Date().toISOString().split("T")[0];

  setPauseCallback(cb: (botId: number, reason: string) => Promise<void>): void {
    this.pauseCallback = cb;
  }

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
      const signal = await this.callAI(snapshot);

      const state = this.getOrCreateState(pairKey);
      state.lastSignal = signal;
      state.lastSnapshot = snapshot;
      state.lastAnalysisAt = now;
      state.analysisCount++;
      state.consecutiveErrors = 0;
      state.lastError = null;

      logger.info(
        { pair: pairKey, action: signal.action, confidence: signal.confidence, takeProfitPct: signal.takeProfitPct },
        "AI signal generated",
      );

      return this.convertToTradeSignal(signal);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const state = this.getOrCreateState(pairKey);
      state.errorCount++;
      state.consecutiveErrors++;
      state.lastError = message;

      logger.error({ err, pair: pairKey, consecutiveErrors: state.consecutiveErrors }, "Failed to generate AI signal");

      if (state.consecutiveErrors >= CONSECUTIVE_ERROR_PAUSE_THRESHOLD && this.pauseCallback) {
        const reason = `AI unavailable after ${state.consecutiveErrors} consecutive failures: ${message}`;
        logger.warn({ botId: bot.id, pair: pairKey, reason }, "Pausing bot due to AI unavailability");
        await this.pauseCallback(bot.id, reason);
      }

      return null;
    }
  }

  private async getAIClient(): Promise<{ client: any; model: string; provider: string }> {
    const { db, aiSettingsTable } = await import("@workspace/db");
    const [settings] = await db.select().from(aiSettingsTable);

    if (settings) {
      let apiKey: string;
      try {
        const { decrypt } = await import("../lib/crypto");
        apiKey = decrypt(settings.apiKey);
      } catch {
        apiKey = settings.apiKey;
      }

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ baseURL: settings.baseUrl, apiKey });
      return { client, model: settings.model, provider: settings.provider };
    }

    if (process.env.DEEPSEEK_API_KEY) {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
      logger.info("Using DEEPSEEK_API_KEY env fallback (no DB config found)");
      return { client, model: "deepseek-chat", provider: "deepseek" };
    }

    throw new Error("IA no configurada. Configura la API en Administración → Configuración IA.");
  }

  private async callAI(snapshot: MarketSnapshot): Promise<AISignalResult> {
    const { client, model, provider } = await this.getAIClient();

    const userMessage = this.buildPrompt(snapshot);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await client.chat.completions.create(
          {
            model,
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
          throw new Error(`Empty response from ${provider}`);
        }

        const usage = response.usage;
        if (usage) {
          this.trackCost(provider, model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
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

  private async trackCost(provider: string, model: string, inputTokens: number, outputTokens: number): Promise<void> {
    const preset = PROVIDER_PRESETS[provider];
    const inputRate = preset?.inputCostPer1M ?? 0.27;
    const outputRate = preset?.outputCostPer1M ?? 1.10;
    const costUsd = (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;

    const today = new Date().toISOString().split("T")[0];
    if (today !== this.costResetDate) {
      this.dailyInputTokens = 0;
      this.dailyOutputTokens = 0;
      this.dailyCostUsd = 0;
      this.dailyCallCount = 0;
      this.costResetDate = today;
    }
    this.dailyInputTokens += inputTokens;
    this.dailyOutputTokens += outputTokens;
    this.dailyCostUsd += costUsd;
    this.dailyCallCount++;

    try {
      const { db, aiCostLogsTable } = await import("@workspace/db");
      await db.insert(aiCostLogsTable).values({
        provider,
        model,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(8),
      });
    } catch (err) {
      logger.warn({ err }, "Failed to persist AI cost log");
    }
  }

  getDailyCostStats() {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.costResetDate) {
      this.dailyInputTokens = 0;
      this.dailyOutputTokens = 0;
      this.dailyCostUsd = 0;
      this.dailyCallCount = 0;
      this.costResetDate = today;
    }
    return {
      date: this.costResetDate,
      inputTokens: this.dailyInputTokens,
      outputTokens: this.dailyOutputTokens,
      totalCostUsd: this.dailyCostUsd,
      callCount: this.dailyCallCount,
    };
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

    let takeProfitPct: number | undefined;
    let tp1Pct: number | undefined;
    let tp2Pct: number | undefined;
    let tp3Pct: number | undefined;
    if (parsed.takeProfitPct !== undefined && parsed.takeProfitPct !== null) {
      const tp = Number(parsed.takeProfitPct);
      let baseTp: number;
      if (!isNaN(tp) && tp >= 0.5 && tp <= 2.0) {
        baseTp = Math.round(tp * 100) / 100;
      } else if (!isNaN(tp) && tp > 2.0) {
        baseTp = 2.0;
      } else if (!isNaN(tp) && tp > 0 && tp < 0.5) {
        baseTp = 0.5;
      } else {
        baseTp = 0;
      }
      if (baseTp > 0) {
        takeProfitPct = baseTp;
        tp1Pct = baseTp;
        tp2Pct = Math.round(baseTp * 2.5 * 100) / 100;
        tp3Pct = Math.round(baseTp * 4 * 100) / 100;
      }
    }

    return {
      action: action as "LONG" | "SHORT" | "HOLD",
      confidence,
      reasoning: String(parsed.reasoning || ""),
      takeProfitPct,
      tp1Pct,
      tp2Pct,
      tp3Pct,
    };
  }

  private convertToTradeSignal(signal: AISignalResult): TradeSignal | null {
    if (signal.action === "HOLD") return null;

    return {
      side: signal.action === "LONG" ? "long" : "short",
      confidence: signal.confidence,
      signal: `${signal.action}: ${signal.reasoning}`,
      takeProfitPct: signal.takeProfitPct,
      tp1Pct: signal.tp1Pct,
      tp2Pct: signal.tp2Pct,
      tp3Pct: signal.tp3Pct,
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
        consecutiveErrors: 0,
        lastError: null,
      };
      this.sentimentMap.set(pair, state);
    }
    return state;
  }

  async isConfigured(): Promise<boolean> {
    if (process.env.DEEPSEEK_API_KEY) return true;
    try {
      const { db, aiSettingsTable } = await import("@workspace/db");
      const [settings] = await db.select().from(aiSettingsTable);
      return !!settings?.apiKey;
    } catch {
      return false;
    }
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
