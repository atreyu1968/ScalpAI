import { type Bot, db, tradeLogsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { dataProcessor, type MarketSnapshot } from "./dataProcessor";
import { higherTimeframe } from "./higherTimeframe";
import type { TradeSignal } from "./botManager";
import { getMinViableTp1Pct } from "./fees";
import { logger } from "../lib/logger";

const DEFAULT_BATCH_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 15000;
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

const SYSTEM_PROMPT = `Eres una IA experta en scalping de criptomonedas con análisis técnico avanzado. Analiza los datos de mercado, patrones de velas, tendencia, y niveles de soporte/resistencia para decidir si operar.

DEBES responder SOLO con un objeto JSON en este formato exacto:
{"action":"LONG"|"SHORT"|"HOLD","confidence":0-100,"takeProfitPct":0.5-2.0,"reasoning":"explicación breve en español"}

=== REGLA FUNDAMENTAL: PREFERIR HOLD ===
Tu trabajo NO es operar constantemente. Tu trabajo es encontrar oportunidades de ALTA PROBABILIDAD.
Si tienes la menor duda, responde HOLD. Mejor perder una oportunidad que perder dinero.
Se esperan entre 70-80% de señales HOLD. Las entradas deben ser selectivas.

=== REQUISITOS OBLIGATORIOS PARA OPERAR (todos deben cumplirse) ===
1. TENDENCIA CLARA: EMA9 > EMA21 > EMA50 para LONG, o EMA9 < EMA21 < EMA50 para SHORT
2. RÉGIMEN DE MERCADO: ADX > 20 (mercado en tendencia). Si ADX < 20 → HOLD siempre
3. PATRÓN DE VELAS CONFIRMANDO: Al menos un patrón de vela alineado con la dirección
4. CONFLUENCIA: Mínimo 3 factores alineados en la misma dirección

=== CRITERIOS DE ENTRADA LONG ===
- Alineación EMA alcista (EMA9 > EMA21 > EMA50)
- ADX > 20 (mercado tendencial)
- Patrón de vela alcista (Hammer, Bullish Engulfing, Morning Star, Three White Soldiers, Bullish Pin Bar)
- RSI entre 30-50 (momentum alcista temprano, NO sobrecomprado)
- MACD histograma positivo o cruzando al alza
- Precio cerca de soporte (rebotando desde soporte)
- Desequilibrio de volumen positivo > 10%
- Bollinger: precio en mitad inferior (zona de valor)

=== CRITERIOS DE ENTRADA SHORT ===
- Alineación EMA bajista (EMA9 < EMA21 < EMA50)
- ADX > 20 (mercado tendencial)
- Patrón de vela bajista (Shooting Star, Bearish Engulfing, Evening Star, Three Black Crows, Bearish Pin Bar)
- RSI entre 50-70 (momentum bajista temprano, NO sobrevendido)
- MACD histograma negativo o cruzando a la baja
- Precio cerca de resistencia (rechazando resistencia)
- Desequilibrio de volumen negativo < -10%
- Bollinger: precio en mitad superior

=== CUANDO HACER HOLD (cualquiera de estas) ===
- ADX < 20 (mercado sin tendencia/lateral) → HOLD OBLIGATORIO
- EMAs mezcladas (sin alineación clara) → HOLD OBLIGATORIO
- RSI entre 40-60 (zona neutra sin dirección clara)
- Sin patrones de velas detectados
- Patrones contradictorios (alcista y bajista al mismo tiempo)
- Spread > 3 bps
- Datos de patrones insuficientes (sin velas formadas aún)
- Volatilidad extrema sin dirección (régimen "volátil" sin tendencia)

=== ESCALA DE CONFIANZA ===
- 90-100: Confluencia perfecta (tendencia + patrón fuerte + volumen + S/R + MACD)
- 80-89: Buena confluencia (4+ factores alineados)
- 70-79: Confluencia aceptable (3 factores alineados)
- 60-69: Señal débil → MEJOR HOLD
- <60: Sin confluencia → HOLD obligatorio

=== TAKE PROFIT ===
- Baja volatilidad: TP conservador 0.5%-0.8%
- Volatilidad media + tendencia clara: TP moderado 0.8%-1.2%
- Alta volatilidad + tendencia fuerte + patrón fuerte: TP agresivo 1.2%-2.0%
- Usar niveles de S/R como objetivos de TP cuando sea posible
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

    if (!snapshot.patterns) {
      logger.debug({ botId: bot.id, pair: bot.pair }, "Pattern data not ready yet (building candles), skipping signal");
      return null;
    }

    const pat = snapshot.patterns;

    if (pat.regime.adx < 20) {
      logger.debug(
        { botId: bot.id, pair: bot.pair, adx: pat.regime.adx, regime: pat.regime.type },
        "ADX < 20 — market not trending, forcing HOLD",
      );
      return null;
    }

    if (pat.trend.emaAlignment === "mixed") {
      logger.debug(
        { botId: bot.id, pair: bot.pair, emaAlignment: pat.trend.emaAlignment },
        "EMAs mixed — no clear trend, forcing HOLD",
      );
      return null;
    }

    if (snapshot.orderBook.spreadBps > 3) {
      logger.debug(
        { botId: bot.id, pair: bot.pair, spreadBps: snapshot.orderBook.spreadBps },
        "Spread too wide (>3 bps), forcing HOLD",
      );
      return null;
    }

    const alignedPatterns = pat.patterns1m.filter((p) => {
      if (pat.trend.emaAlignment === "bullish" && p.direction === "bullish") return true;
      if (pat.trend.emaAlignment === "bearish" && p.direction === "bearish") return true;
      return false;
    });

    if (alignedPatterns.length === 0) {
      logger.debug(
        { botId: bot.id, pair: bot.pair, emaAlignment: pat.trend.emaAlignment, patterns: pat.patterns1m.map((p) => p.name) },
        "No candle patterns aligned with trend direction, forcing HOLD",
      );
      return null;
    }

    const htfBias = await higherTimeframe.getBias(bot.pair, useFutures);
    if (htfBias) {
      if (pat.trend.emaAlignment === "bullish" && htfBias.bias === "bearish") {
        logger.debug(
          { botId: bot.id, pair: bot.pair, htfBias: htfBias.bias, emaAlignment: pat.trend.emaAlignment },
          "1H bias bajista contradice señal alcista 1m/5m, forzando HOLD",
        );
        return null;
      }
      if (pat.trend.emaAlignment === "bearish" && htfBias.bias === "bullish") {
        logger.debug(
          { botId: bot.id, pair: bot.pair, htfBias: htfBias.bias, emaAlignment: pat.trend.emaAlignment },
          "1H bias alcista contradice señal bajista 1m/5m, forzando HOLD",
        );
        return null;
      }
    }

    const buyRatio = snapshot.recentTrades.buyRatio;
    if (snapshot.recentTrades.count >= 10) {
      if (pat.trend.emaAlignment === "bullish" && buyRatio < 0.45) {
        logger.debug(
          { botId: bot.id, pair: bot.pair, buyRatio: buyRatio.toFixed(3), emaAlignment: pat.trend.emaAlignment },
          "Flujo vendedor dominante (buyRatio<45%) contradice señal alcista, forzando HOLD",
        );
        return null;
      }
      if (pat.trend.emaAlignment === "bearish" && buyRatio > 0.55) {
        logger.debug(
          { botId: bot.id, pair: bot.pair, buyRatio: buyRatio.toFixed(3), emaAlignment: pat.trend.emaAlignment },
          "Flujo comprador dominante (buyRatio>55%) contradice señal bajista, forzando HOLD",
        );
        return null;
      }
    }

    const cacheKey = `${bot.userId}:${bot.pair}`;
    const now = Date.now();
    const lastCall = this.lastCallTime.get(cacheKey) ?? 0;
    if (now - lastCall < this.batchIntervalMs) {
      const cached = this.sentimentMap.get(cacheKey);
      if (cached?.lastSignal) {
        return this.convertToTradeSignal(cached.lastSignal);
      }
      return null;
    }

    this.lastCallTime.set(cacheKey, now);

    try {
      const signal = await this.callAI(snapshot, bot.userId);

      const state = this.getOrCreateState(cacheKey);
      state.lastSignal = signal;
      state.lastSnapshot = snapshot;
      state.lastAnalysisAt = now;
      state.analysisCount++;
      state.consecutiveErrors = 0;
      state.lastError = null;

      logger.info(
        { pair: bot.pair, action: signal.action, confidence: signal.confidence, takeProfitPct: signal.takeProfitPct },
        "AI signal generated",
      );

      const converted = this.convertToTradeSignal(signal);
      if (converted && converted.tp1Pct !== undefined) {
        const minTp1 = getMinViableTp1Pct(bot);
        if (converted.tp1Pct < minTp1) {
          logger.info(
            {
              botId: bot.id,
              pair: bot.pair,
              tp1Pct: converted.tp1Pct,
              minTp1: minTp1.toFixed(3),
              leverage: bot.leverage,
              mode: bot.mode,
            },
            "TP1 no cubre comisiones + margen de seguridad, señal rechazada",
          );
          return null;
        }
      }
      return converted;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const state = this.getOrCreateState(cacheKey);
      state.errorCount++;
      state.consecutiveErrors++;
      state.lastError = message;

      logger.error({ err, pair: bot.pair, userId: bot.userId, consecutiveErrors: state.consecutiveErrors }, "Failed to generate AI signal");

      if (state.consecutiveErrors >= CONSECUTIVE_ERROR_PAUSE_THRESHOLD && this.pauseCallback) {
        const reason = `AI unavailable after ${state.consecutiveErrors} consecutive failures: ${message}`;
        logger.warn({ botId: bot.id, pair: bot.pair, reason }, "Pausing bot due to AI unavailability");
        await this.pauseCallback(bot.id, reason);
      }

      return null;
    }
  }

  private async getAIClient(userId?: number): Promise<{ client: any; model: string; provider: string }> {
    const { db, userAiSettingsTable, aiSettingsTable } = await import("@workspace/db");
    const { decrypt } = await import("../lib/crypto");
    const OpenAI = (await import("openai")).default;

    if (userId) {
      const { eq } = await import("drizzle-orm");
      const [userSettings] = await db.select().from(userAiSettingsTable).where(eq(userAiSettingsTable.userId, userId));
      if (userSettings) {
        let apiKey: string;
        try {
          apiKey = decrypt(userSettings.apiKey);
        } catch {
          apiKey = userSettings.apiKey;
        }
        const client = new OpenAI({ baseURL: userSettings.baseUrl, apiKey });
        return { client, model: userSettings.model, provider: userSettings.provider };
      }
    }

    const [settings] = await db.select().from(aiSettingsTable);
    if (settings) {
      let apiKey: string;
      try {
        apiKey = decrypt(settings.apiKey);
      } catch {
        apiKey = settings.apiKey;
      }
      const client = new OpenAI({ baseURL: settings.baseUrl, apiKey });
      return { client, model: settings.model, provider: settings.provider };
    }

    if (process.env.DEEPSEEK_API_KEY) {
      const client = new OpenAI({
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        apiKey: process.env.DEEPSEEK_API_KEY,
      });
      logger.info("Using DEEPSEEK_API_KEY env fallback (no DB config found)");
      return { client, model: "deepseek-chat", provider: "deepseek" };
    }

    throw new Error("IA no configurada. Configura tu API de IA en Configuración → Inteligencia Artificial.");
  }

  private tradeHistoryCache: Map<string, { data: string; fetchedAt: number }> = new Map();
  private readonly HISTORY_CACHE_TTL_MS = 120_000;

  private async getTradeHistory(pair: string, userId?: number): Promise<string> {
    const historyCacheKey = userId ? `${userId}:${pair}` : pair;
    const cached = this.tradeHistoryCache.get(historyCacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.HISTORY_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const conditions = [eq(tradeLogsTable.pair, pair), eq(tradeLogsTable.status, "closed")];
      if (userId) {
        conditions.push(eq(tradeLogsTable.userId, userId));
      }
      const recentTrades = await db
        .select({
          side: tradeLogsTable.side,
          entryPrice: tradeLogsTable.entryPrice,
          exitPrice: tradeLogsTable.exitPrice,
          pnl: tradeLogsTable.pnl,
          aiSignal: tradeLogsTable.aiSignal,
          aiConfidence: tradeLogsTable.aiConfidence,
          tpLevelReached: tradeLogsTable.tpLevelReached,
          closedAt: tradeLogsTable.closedAt,
        })
        .from(tradeLogsTable)
        .where(and(...conditions))
        .orderBy(desc(tradeLogsTable.closedAt))
        .limit(20);

      if (recentTrades.length === 0) {
        this.tradeHistoryCache.set(historyCacheKey, { data: "", fetchedAt: Date.now() });
        return "";
      }

      const wins = recentTrades.filter((t) => parseFloat(t.pnl || "0") > 0).length;
      const losses = recentTrades.filter((t) => parseFloat(t.pnl || "0") < 0).length;
      const totalPnl = recentTrades.reduce((s, t) => s + parseFloat(t.pnl || "0"), 0);
      const avgWin = wins > 0 ? recentTrades.filter((t) => parseFloat(t.pnl || "0") > 0).reduce((s, t) => s + parseFloat(t.pnl || "0"), 0) / wins : 0;
      const avgLoss = losses > 0 ? recentTrades.filter((t) => parseFloat(t.pnl || "0") < 0).reduce((s, t) => s + parseFloat(t.pnl || "0"), 0) / losses : 0;
      const avgTp = recentTrades.reduce((s, t) => s + (t.tpLevelReached || 0), 0) / recentTrades.length;

      const longTrades = recentTrades.filter((t) => t.side === "long");
      const shortTrades = recentTrades.filter((t) => t.side === "short");
      const longWins = longTrades.filter((t) => parseFloat(t.pnl || "0") > 0).length;
      const shortWins = shortTrades.filter((t) => parseFloat(t.pnl || "0") > 0).length;

      const last5 = recentTrades.slice(0, 5).map((t) => {
        const pnl = parseFloat(t.pnl || "0");
        return `  ${t.side.toUpperCase()} ${pnl >= 0 ? "✓" : "✗"} PnL:${pnl.toFixed(4)} conf:${t.aiConfidence || "?"} TP${t.tpLevelReached || 0}`;
      });

      const historyBlock = `
HISTORIAL RECIENTE (${recentTrades.length} trades cerrados):
- Win Rate: ${wins}/${recentTrades.length} (${((wins / recentTrades.length) * 100).toFixed(0)}%)
- PnL Total: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)} USDT
- Ganancia promedio: +${avgWin.toFixed(4)} | Pérdida promedio: ${avgLoss.toFixed(4)}
- TP promedio alcanzado: ${avgTp.toFixed(1)}/3
- LONGs: ${longWins}/${longTrades.length} ganados | SHORTs: ${shortWins}/${shortTrades.length} ganados
- Últimos 5 trades:
${last5.join("\n")}
INSTRUCCIÓN: Usa este historial para mejorar tus decisiones. Si el win rate es bajo, sé MÁS SELECTIVO y prefiere HOLD. Si un lado (LONG/SHORT) pierde consistentemente, evítalo salvo confluencia excepcional.`;

      this.tradeHistoryCache.set(historyCacheKey, { data: historyBlock, fetchedAt: Date.now() });
      return historyBlock;
    } catch (err) {
      logger.warn({ err, pair }, "Failed to fetch trade history for AI prompt");
      return "";
    }
  }

  private async callAI(snapshot: MarketSnapshot, userId?: number): Promise<AISignalResult> {
    const { client, model, provider } = await this.getAIClient(userId);

    const tradeHistory = await this.getTradeHistory(snapshot.pair, userId);
    const userMessage = this.buildPrompt(snapshot) + tradeHistory;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const requestBody: Record<string, unknown> = {
          model,
          max_tokens: 256,
          temperature: 0.1,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
        };
        if (provider !== "gemini") {
          requestBody.response_format = { type: "json_object" };
        }

        const response = await client.chat.completions.create(
          requestBody as Parameters<typeof client.chat.completions.create>[0],
          { signal: controller.signal },
        );

        clearTimeout(timeout);

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error(`Empty response from ${provider}`);
        }

        const usage = response.usage;
        if (usage) {
          this.trackCost(provider, model, usage.prompt_tokens || 0, usage.completion_tokens || 0, userId);
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

  private async trackCost(provider: string, model: string, inputTokens: number, outputTokens: number, userId?: number): Promise<void> {
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
        userId: userId ?? null,
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
    const pat = snapshot.patterns;

    let prompt = `Datos de mercado ${snapshot.pair} — ${new Date(snapshot.timestamp).toISOString()}:

LIBRO DE ÓRDENES:
- Bid: ${ob.bestBid.toFixed(2)} | Ask: ${ob.bestAsk.toFixed(2)} | Spread: ${ob.spreadBps.toFixed(1)} bps
- Profundidad Bid: $${ob.bidDepth.toFixed(0)} | Ask: $${ob.askDepth.toFixed(0)}
- Desequilibrio volumen: ${(ob.volumeImbalance * 100).toFixed(1)}%

TRADES RECIENTES (${trades.count}):
- VWAP: ${trades.vwap.toFixed(2)} | Ratio compras: ${(trades.buyRatio * 100).toFixed(1)}%

INDICADORES BÁSICOS:
- RSI(14): ${ind.rsi !== null ? ind.rsi.toFixed(1) : "N/A"}
- Cambio 1min: ${ind.priceChange1m !== null ? ind.priceChange1m.toFixed(3) + "%" : "N/A"}
- Volatilidad: ${ind.volatility !== null ? ind.volatility.toFixed(4) + "%" : "N/A"}`;

    if (pat) {
      const trend = pat.trend;
      prompt += `

ANÁLISIS DE TENDENCIA:
- Dirección: ${trend.direction.toUpperCase()} | Fuerza: ${trend.strength.toFixed(1)}/100
- EMA9: ${trend.ema9.toFixed(2)} | EMA21: ${trend.ema21.toFixed(2)} | EMA50: ${trend.ema50.toFixed(2)}
- Alineación EMAs: ${trend.emaAlignment.toUpperCase()}

RÉGIMEN DE MERCADO:
- Tipo: ${pat.regime.type.toUpperCase()} | ADX: ${pat.regime.adx.toFixed(1)}
- ${pat.regime.description}`;

      if (pat.patterns1m.length > 0) {
        prompt += `

PATRONES DE VELAS (1min):
${pat.patterns1m.map((p) => `- ${p.name}: ${p.direction} (fuerza ${p.strength})`).join("\n")}`;
      } else {
        prompt += `

PATRONES DE VELAS (1min): Ninguno detectado`;
      }

      if (pat.patterns5m.length > 0) {
        prompt += `

PATRONES DE VELAS (5min):
${pat.patterns5m.map((p) => `- ${p.name}: ${p.direction} (fuerza ${p.strength})`).join("\n")}`;
      }

      const sr = pat.supportResistance;
      if (sr.supports.length > 0 || sr.resistances.length > 0) {
        prompt += `

SOPORTE/RESISTENCIA:`;
        if (sr.nearestSupport) prompt += `\n- Soporte más cercano: ${sr.nearestSupport.toFixed(2)}`;
        if (sr.nearestResistance) prompt += `\n- Resistencia más cercana: ${sr.nearestResistance.toFixed(2)}`;
        if (sr.supports.length > 0) prompt += `\n- Soportes: ${sr.supports.map((s) => s.toFixed(2)).join(", ")}`;
        if (sr.resistances.length > 0) prompt += `\n- Resistencias: ${sr.resistances.map((r) => r.toFixed(2)).join(", ")}`;
      }

      if (pat.macd) {
        prompt += `

MACD:
- Línea: ${pat.macd.line.toFixed(2)} | Señal: ${pat.macd.signal.toFixed(2)} | Histograma: ${pat.macd.histogram.toFixed(2)}`;
      }

      if (pat.bollingerPosition !== null) {
        prompt += `
- Bollinger posición: ${(pat.bollingerPosition * 100).toFixed(1)}% (0%=banda inferior, 100%=banda superior)`;
      }
    } else {
      prompt += `

PATRONES: Datos insuficientes — aún se están formando las velas. DEBES responder HOLD.`;
    }

    prompt += `

Responde SOLO con JSON.`;

    return prompt;
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

  async isConfigured(userId?: number): Promise<boolean> {
    try {
      if (userId) {
        const { db, userAiSettingsTable } = await import("@workspace/db");
        const { eq } = await import("drizzle-orm");
        const [userSettings] = await db.select().from(userAiSettingsTable).where(eq(userAiSettingsTable.userId, userId));
        if (userSettings?.apiKey) return true;
      }
      if (process.env.DEEPSEEK_API_KEY) return true;
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
    this.batchIntervalMs = Math.max(10000, ms);
  }

  getBatchInterval(): number {
    return this.batchIntervalMs;
  }
}

export const signalService = new SignalService();
