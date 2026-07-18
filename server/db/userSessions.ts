import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const userSessions = sqliteTable("user_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull(),
  sessionIdHash: text("session_id_hash").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  device: text("device"),
  loginAt: integer("login_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  logoutAt: integer("logout_at", { mode: "timestamp" }),
  status: text("status", {
    enum: ["ACTIVE", "IDLE", "OFFLINE", "EXPIRED", "REVOKED"],
  })
    .notNull()
    .default("ACTIVE"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
