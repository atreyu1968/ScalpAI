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
- `DELETE /api/api-keys/:id` — Delete API key (requires 2FA header)

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
- `lib/api-spec/openapi.yaml` — OpenAPI specification (source of truth)
