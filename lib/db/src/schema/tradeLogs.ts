import { pgTable, text, serial, timestamp, integer, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { botsTable } from "./bots";

export const tradeSideEnum = pgEnum("trade_side", ["long", "short"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);

export const tradeLogsTable = pgTable("trade_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  botId: integer("bot_id").references(() => botsTable.id, { onDelete: "set null" }),
  pair: text("pair").notNull(),
  side: tradeSideEnum("side").notNull(),
  mode: text("mode").notNull(),
  status: tradeStatusEnum("status").notNull().default("open"),
  entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
  exitPrice: numeric("exit_price", { precision: 18, scale: 8 }),
  quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
  pnl: numeric("pnl", { precision: 18, scale: 8 }),
  commission: numeric("commission", { precision: 18, scale: 8 }),
  slippage: numeric("slippage", { precision: 18, scale: 8 }),
  aiConfidence: numeric("ai_confidence", { precision: 5, scale: 2 }),
  aiSignal: text("ai_signal"),
  aiTakeProfitPct: numeric("ai_take_profit_pct", { precision: 5, scale: 2 }),
  aiTp1Pct: numeric("ai_tp1_pct", { precision: 5, scale: 2 }),
  aiTp2Pct: numeric("ai_tp2_pct", { precision: 5, scale: 2 }),
  aiTp3Pct: numeric("ai_tp3_pct", { precision: 5, scale: 2 }),
  dynamicStopPct: numeric("dynamic_stop_pct", { precision: 6, scale: 3 }),
  tpLevelReached: integer("tp_level_reached").notNull().default(0),
  remainingQuantity: numeric("remaining_quantity", { precision: 18, scale: 8 }),
  realizedPnl: numeric("realized_pnl", { precision: 18, scale: 8 }).default("0"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTradeLogSchema = createInsertSchema(tradeLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTradeLog = z.infer<typeof insertTradeLogSchema>;
export type TradeLog = typeof tradeLogsTable.$inferSelect;
