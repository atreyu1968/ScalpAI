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
  botId: integer("bot_id").notNull().references(() => botsTable.id, { onDelete: "cascade" }),
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
