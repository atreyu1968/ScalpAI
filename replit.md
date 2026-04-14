# ScalpAI Workspace

## Overview

ScalpAI is a multi-user crypto scalping platform with AI-powered trading. pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: JWT + argon2 password hashing + TOTP 2FA (otpauth + qrcode)
- **Encryption**: AES-256-GCM for Binance API key storage

## Database Tables

- `users` — email, password hash, role (admin/user), TOTP secret, enabled flag
- `api_keys` — encrypted Binance API key/secret per user, label, permissions
- `bots` — bot configuration per user (pair, mode, leverage, capital, AI threshold, risk limits)
- `trade_logs` — execution history (entry/exit price, PNL, commission, AI signal)

## API Endpoints

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login (supports 2FA)
- `GET /api/auth/profile` — Get current user profile (requires auth)

### 2FA (TOTP)
- `POST /api/auth/totp/setup` — Initialize TOTP setup (QR code)
- `POST /api/auth/totp/verify` — Verify and enable 2FA
- `POST /api/auth/totp/disable` — Disable 2FA

### API Keys
- `GET /api/api-keys` — List user's API keys (masked)
- `POST /api/api-keys` — Add new Binance API key (encrypted at rest)
- `PATCH /api/api-keys/:id` — Update API key label/credentials (requires 2FA for key changes)
- `DELETE /api/api-keys/:id` — Delete API key (requires 2FA header)

### Bots
- `GET /api/bots` — List user's bots
- `POST /api/bots` — Create new bot (pair, mode, leverage, capital, risk params)
- `GET /api/bots/:id` — Get bot details
- `PATCH /api/bots/:id` — Update bot configuration
- `DELETE /api/bots/:id` — Delete bot (stops if running)
- `POST /api/bots/:id/start` — Start bot (subscribes to market data)
- `POST /api/bots/:id/stop` — Stop bot gracefully
- `POST /api/bots/:id/kill` — Emergency kill switch (instant stop)
- `POST /api/bots/kill-all` — Panic button (stop all bots)

### Trades
- `GET /api/trades` — List trade logs (filterable by botId, status)
- `GET /api/trades/:id` — Get trade details

### Market & Monitoring
- `GET /api/market/status` — WebSocket connection status for market data
- `GET /api/rate-limit/status` — Binance API rate limit usage

### Admin (requires admin role)
- `GET /api/admin/users` — List all users with bot counts
- `GET /api/admin/users/:id` — Get user details with their API keys and bots

## Architecture — Trading Engine

### Market Data Key Scheme
- Spot subscriptions use plain symbol key: `btcusdt`
- Futures subscriptions use `f:` prefix: `f:btcusdt`
- All data storage (orderBooks, recentTrades), lookups, and lifecycle ops use this canonical key consistently
- Bot mode determines key: `mode=live && leverage>1` → futures, otherwise spot

### Services (`artifacts/api-server/src/services/`)
- **marketData.ts** — Binance WebSocket connections for Order Book (L2 depth) and trade streams. Spot (`stream.binance.com`) and futures (`fstream.binance.com`) endpoints. Exponential backoff reconnection (1s-30s). Reference-counted subscriptions.
- **botManager.ts** — Bot lifecycle (start/stop/kill), 2s execution cycle with two-phase risk checks (pre-trade drawdown → trade monitoring → post-trade recheck). killBot() closes all open positions before stopping. Pair validation (BASE/QUOTE format). Pluggable SignalProvider interface for AI integration.
- **paperTrading.ts** — Simulated execution against live Order Book with pessimistic slippage (5 bps) and taker/maker commission modeling (0.05%/0.1%)
- **liveTrading.ts** — Real order placement via ccxt. Spot/futures selection based on leverage. IOC limit orders with fill verification for both open and close. Unfilled close orders automatically retry as market orders. Emergency close uses market orders. Typed ExchangeClient interface.
- **riskManager.ts** — Per-trade stop-loss check, UTC day-scoped daily drawdown tracking with auto-reset at day boundaries (dailyPnlDate field), auto-pause (24h), kill switch, kill-all panic button
- **rateLimiter.ts** — Tracks Binance API weight usage per user (1200/min limit), throttles at 80%

### Input Validation (OpenAPI + Zod)
- Pair format: regex `^[A-Z0-9]+/[A-Z0-9]+$` enforced at API layer
- Leverage: integer 1-125
- Bot name: 1-100 characters

## Environment Variables

- `JWT_SECRET` — Secret for JWT token signing
- `ENCRYPTION_MASTER_KEY` — Master key for AES-256 encryption of API keys
- `DATABASE_URL` — PostgreSQL connection string

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Key Files

- `lib/db/src/schema/` — Database table definitions (users, apiKeys, bots, tradeLogs)
- `artifacts/api-server/src/routes/` — API route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — JWT auth middleware with role checks
- `artifacts/api-server/src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt for API keys
- `artifacts/api-server/src/lib/jwt.ts` — JWT sign/verify utilities
- `artifacts/api-server/src/services/` — Trading engine services (marketData, botManager, paperTrading, liveTrading, riskManager, rateLimiter)
- `artifacts/api-server/src/routes/bots.ts` — Bot CRUD + lifecycle endpoints
- `artifacts/api-server/src/routes/trades.ts` — Trade log query endpoints
- `lib/api-spec/openapi.yaml` — OpenAPI specification (source of truth)
