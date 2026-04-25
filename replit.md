# ScalpAI Workspace

## Overview

ScalpAI is a multi-user crypto scalping platform that leverages AI for automated trading. It aims to provide users with an intelligent and efficient way to participate in cryptocurrency markets, featuring real-time market data analysis, sophisticated risk management, and multi-provider AI signal generation. The platform supports both spot and futures trading, offering a comprehensive suite of tools for bot creation, management, and performance monitoring.

## User Preferences

I prefer to communicate in clear, concise language. Please provide detailed explanations when introducing new concepts or significant changes. I value iterative development and would like to be consulted before any major architectural changes or feature implementations. For code, I appreciate well-structured, readable TypeScript following modern best practices. I want to ensure the system is robust, secure, and performant. Do not make changes to files related to deployment (`install.sh`, systemd service files, Nginx configurations) without explicit instruction.

## System Architecture

ScalpAI is built as a pnpm workspace monorepo using TypeScript, targeting Node.js 24. The backend API is developed with Express 5, utilizing PostgreSQL with Drizzle ORM for data persistence and Zod for validation. API endpoints are defined via OpenAPI and code-generated using Orval.

**Key Architectural Components:**
- **Monorepo Structure:** Organized using pnpm workspaces to manage multiple packages (API server, database, API spec, dashboard).
- **Authentication & Authorization:** Implements JWT for user sessions, argon2 for password hashing, and supports TOTP 2FA. User roles (admin/user) control access to specific functionalities. Rate limiting (express-rate-limit) protects auth routes (login, register, forgot-password, reset-password, resend-verification) — 20 requests per 15-minute window per IP. **Registration is invitation-only**: admins create invitation codes (with optional email binding and expiry) via `/api/admin/invitations`; the register endpoint requires a valid `invitationCode`. Invitation consumption is atomic (DB transaction) to prevent race conditions. Schema: `invitations` table (`lib/db/src/schema/invitations.ts`). Routes: `artifacts/api-server/src/routes/invitations.ts`. Admin UI: InvitationsSection in `admin.tsx`. Register UI accepts `?code=` query param for pre-filled codes.
- **Data Encryption:** Sensitive data like Binance API keys are encrypted at rest using AES-256-GCM.
- **Trading Engine:**
    - **Market Data Service:** Manages WebSocket connections to Binance for real-time Order Book and trade streams, supporting both spot and futures. Features exponential backoff for reconnection.
    - **Bot Manager:** Handles bot lifecycle (start/stop/kill), executing a 2-second cycle for risk checks and trade monitoring. **Restart reconciliation**: on bot startup, `reconcileOpenTrades()` checks all open positions — closes trades expired by timeout during downtime, triggers stop-loss if price has already breached the threshold, and logs the state of valid open trades continuing into monitoring.
    - **Trading Execution:** `paperTrading.ts` provides simulated execution with slippage and commission modeling. `liveTrading.ts` handles real order placement via `ccxt`, prioritizing IOC limit orders and using market orders for emergency closures.
    - **Risk Manager:** Implements per-trade stop-loss, UTC day-scoped daily drawdown tracking with auto-reset, and auto-pause functionalities.
    - **Rate Limiter:** Tracks Binance API weight usage to prevent exceeding limits.
- **Trading Strategies (Multi-Strategy Dispatcher):** Each bot has a `strategy` field (`ai` or `trend_pullback`, default `trend_pullback` for new bots). The signal provider in `index.ts` dispatches to the appropriate engine per cycle. Legacy bots with `null` strategy fall back to AI for safety.
    - **Trend-Pullback Spot (deterministic):** `trendPullback.ts` implements a rules-based long-only strategy on BTC/USDT and ETH/USDT, paper-only and spot-only. Uses 4H trend filter (close > EMA50 > EMA200), 1H pullback to EMA50 with confirmation close above, RSI(14) in 40-60, spread < 5 bps, ATR(14)×1.5 stop with min 0.8% distance. Default targets: TP1 2R, TP2 3R, TP3 5R, but `tp1RR/tp2RR/tp3RR` are **configurable per bot via `bots.strategyParams`** (jsonb) and exposed in the dashboard create dialog. Requires net RR ≥ 1.5 and net expected profit ≥ 1% after fees. **RR / fee invariant:** the net RR check is `(tp1RR·x − fees)/(x + fees) ≥ minimumRiskRewardNet`, whose limit as the stop grows is `tp1RR`, so `tp1RR` must be **strictly greater** than `minimumRiskRewardNet`. Both POST and PATCH `/api/bots` validate `tp1RR > minimumRiskRewardNet` and `tp1RR < tp2RR < tp3RR` (Spanish error messages), and PATCH merges incoming overrides with the bot's existing `strategyParams` before validating. The default combination `tp1RR = 2.0`, `minimumRiskRewardNet = 1.5`, `estimatedFees = 0.0025` keeps the invariant: net 1.5R is reachable for any stop ≥ ~1.25%, well above `minimumStopDistance` (0.8%). Position size from 0.5% capital risk. Klines are loaded via `klines.ts` (REST seed + Binance WS `kline_<interval>` for 1h and 4h). Per-trade dynamic stop (`dynamicStopPct`) is stored on the trade row and used by the monitor instead of `bot.stopLossPercent`.
- **AI Signal Generation:**
    - **Data Processor:** Constructs `MarketSnapshot` objects from live order book data, including volume imbalance, spread, depth, recent trade stats, RSI, price change, and volatility. Maintains price history.
    - **Signal Service:** Generates trading signals (LONG/SHORT/HOLD) with confidence scores and take-profit percentages using multiple AI providers (DeepSeek, GPT-4o, Gemini 2.0 Flash, Qwen). Each user configures their own AI API key (per-user `user_ai_settings` table, encrypted AES-256-GCM), with optional fallback to admin global settings. Signal caches, trade history context, and cost tracking are all scoped per-user to ensure isolation. It includes retry logic and per-user cost tracking in `ai_cost_logs`.
    - **Pattern Recognition Engine:** Builds OHLC candles from tick data and identifies various candlestick patterns, trend analyses (EMA alignment), and market regimes (ADX-based). Hard pre-trade filters are applied to AI signals (e.g., ADX < 20, mixed EMAs, wide spread, no aligned candle patterns). **Warmup on startup**: `warmup.ts` fetches 120×1m + 60×5m historical klines from Binance REST API (`data-api.binance.vision` with fallback endpoints) and seeds both `patternEngine` and `dataProcessor.priceHistory`, so RSI/EMA/patterns are available immediately after restart. Warmup also runs on manual bot start, and is skipped if candles are already loaded.
- **Trade Management:** Supports multi take-profit levels (TP1, TP2, TP3) with dynamic stop-loss adjustments. Includes a position reversal mechanism based on AI signal confidence and a cooldown period.
- **UI/UX:** The frontend dashboard is built with React 18, Vite, TailwindCSS, and shadcn/ui. It uses `wouter` for client-side routing and TanStack React Query for state management. The design features an emerald green primary theme with full dark/light mode toggle (ThemeContext with localStorage persistence, Sun/Moon toggle in sidebar, inline script prevents FOUC). All chart components (candlestick SVG, price chart, Recharts tooltips) are theme-aware. The entire UI is localized to Spanish. It also functions as a Progressive Web App (PWA).
- **Real-time Updates:** A WebSocket-based event bus `tradingEvents.ts` broadcasts trading and bot lifecycle events, which are consumed by the frontend for live updates.

## External Dependencies

- **Database:** PostgreSQL (with Drizzle ORM)
- **API Framework:** Express 5
- **Validation:** Zod
- **API Codegen:** Orval (from OpenAPI spec)
- **Encryption:** AES-256-GCM
- **2FA:** otpauth, qrcode
- **AI Providers:** DeepSeek, OpenAI (GPT-4o), Google (Gemini 2.0 Flash), Alibaba Cloud (Qwen) – accessed via OpenAI SDK compatible interfaces.
- **Email Service:** Nodemailer (for user verification and password reset emails)
- **Cryptocurrency Exchange API:** Binance (for market data and live trading)
- **Market Data & Trading Library:** ccxt (for interacting with Binance API)