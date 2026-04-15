import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const aiSettingsTable = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().default("openrouter"),
  apiKey: text("api_key").notNull(),
  baseUrl: text("base_url").notNull().default("https://openrouter.ai/api/v1"),
  model: text("model").notNull().default("deepseek/deepseek-chat-v3.1"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiSettings = typeof aiSettingsTable.$inferSelect;
