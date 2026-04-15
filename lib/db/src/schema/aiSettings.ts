import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";

export const aiSettingsTable = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("deepseek"),
  apiKey: text("api_key").notNull(),
  baseUrl: text("base_url").notNull().default("https://api.deepseek.com"),
  model: text("model").notNull().default("deepseek-chat"),
  signalIntervalS: integer("signal_interval_s").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiSettings = typeof aiSettingsTable.$inferSelect;
