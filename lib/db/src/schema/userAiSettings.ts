import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userAiSettingsTable = pgTable("user_ai_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  provider: text("provider").notNull().default("deepseek"),
  apiKey: text("api_key").notNull(),
  baseUrl: text("base_url").notNull().default("https://api.deepseek.com"),
  model: text("model").notNull().default("deepseek-chat"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserAiSettings = typeof userAiSettingsTable.$inferSelect;
