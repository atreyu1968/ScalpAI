import { pgTable, text, serial, timestamp, integer, numeric, boolean, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { apiKeysTable } from "./apiKeys";

export const botModeEnum = pgEnum("bot_mode", ["paper", "live"]);
export const botStatusEnum = pgEnum("bot_status", ["stopped", "running", "paused", "error"]);
export const botMarketTypeEnum = pgEnum("bot_market_type", ["spot", "futures"]);

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  apiKeyId: integer("api_key_id").references(() => apiKeysTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  pair: text("pair").notNull().default("BTC/USDT"),
  mode: botModeEnum("mode").notNull().default("paper"),
  marketType: botMarketTypeEnum("market_type").notNull().default("spot"),
  status: botStatusEnum("status").notNull().default("stopped"),
  leverage: integer("leverage").notNull().default(1),
  operationalLeverage: integer("operational_leverage").notNull().default(1),
  capitalAllocated: numeric("capital_allocated", { precision: 18, scale: 8 }).notNull().default("100"),
  aiConfidenceThreshold: numeric("ai_confidence_threshold", { precision: 5, scale: 2 }).notNull().default("85.00"),
  stopLossPercent: numeric("stop_loss_percent", { precision: 5, scale: 2 }).notNull().default("0.20"),
  maxDailyDrawdownPercent: numeric("max_daily_drawdown_percent", { precision: 5, scale: 2 }).notNull().default("5.00"),
  dailyPnl: numeric("daily_pnl", { precision: 18, scale: 8 }).notNull().default("0"),
  dailyPnlDate: date("daily_pnl_date"),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  pauseReason: text("pause_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotSchema = createInsertSchema(botsTable).omit({
  id: true,
  status: true,
  dailyPnl: true,
  dailyPnlDate: true,
  pausedUntil: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBot = z.infer<typeof insertBotSchema>;
export type Bot = typeof botsTable.$inferSelect;
