import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Feature Flag 表 — L2 功能开关
// 支持: boolean / 百分比灰度 / 按用户白名单
export const featureFlags = sqliteTable("feature_flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  description: text("description"),
  // "boolean" | "percentage" | "whitelist"
  type: text("type", { enum: ["boolean", "percentage", "whitelist"] })
    .notNull()
    .default("boolean"),
  // boolean: 0=false, 1=true
  enabled: integer("enabled").notNull().default(0),
  // percentage: 0~100
  percentage: real("percentage").default(0),
  // whitelist: JSON array of userIds
  whitelist: text("whitelist", { mode: "json" }).$type<number[]>(),
  // 环境过滤: "all" | "development" | "production"
  envFilter: text("env_filter").notNull().default("all"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});
