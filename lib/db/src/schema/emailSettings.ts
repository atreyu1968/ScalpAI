import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const emailSettingsTable = pgTable("email_settings", {
  id: serial("id").primaryKey(),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  smtpUser: text("smtp_user").notNull(),
  smtpPass: text("smtp_pass").notNull(),
  fromName: text("from_name").notNull().default("ScalpAI"),
  fromEmail: text("from_email").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EmailSettings = typeof emailSettingsTable.$inferSelect;
