import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";

export const aiCostLogsTable = pgTable("ai_cost_logs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiCostLog = typeof aiCostLogsTable.$inferSelect;
