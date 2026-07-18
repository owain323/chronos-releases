import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const activityEvents = sqliteTable("activity_events", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: integer("user_id").notNull(),
  workspaceId: integer("workspace_id"),
  sessionId: text("session_id"),
  source: text("source", { enum: ["USER", "AI", "SYSTEM", "SCHEDULE"] })
    .notNull()
    .default("USER"),
  category: text("category", {
    enum: ["AUTH", "ACCESS", "BUSINESS", "SECURITY", "AI"],
  }).notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  level: text("level", { enum: ["INFO", "IMPORTANT", "SECURITY", "CRITICAL"] })
    .notNull()
    .default("INFO"),
  metadata: text("metadata", { mode: "json" }),
  ipAddress: text("ip_address"),
  requestId: text("request_id"),
  status: text("status", { enum: ["SUCCESS", "FAILURE", "PENDING"] })
    .notNull()
    .default("SUCCESS"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
