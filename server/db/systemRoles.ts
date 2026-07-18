import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const systemRoles = sqliteTable("system_roles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull(),
  systemRole: text("system_role", {
    enum: ["SYSTEM_OWNER", "SYSTEM_AUDITOR"],
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
