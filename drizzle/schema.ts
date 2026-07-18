import { integer, sqliteTable, text, real, unique, index } from "drizzle-orm/sqlite-core";
import { activityEvents } from "../server/db/activityEvents";
import { userSessions } from "../server/db/userSessions";

/**
 * Core user table.
 */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: text("email", { length: 320 }),
  loginMethod: text("loginMethod", { length: 64 }),
  role: text("role").default("user").notNull(),
  passwordHash: text("passwordHash"), // bcrypt hash，null = 未设置密码（仅本地模式），
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastSignedIn: text("lastSignedIn")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  emailVerified: integer("emailVerified").default(0),
  notificationPrefs: text("notificationPrefs"),
  displayName: text("displayName"),
  avatarUrl: text("avatarUrl"),
  bio: text("bio"),
  resetTokenHash: text("resetTokenHash"),
  resetTokenExpiresAt: text("resetTokenExpiresAt"),
  tokenVersion: integer("tokenVersion").default(0).notNull(),
}, (t) => ({ emailIdx: index("users_email_idx").on(t.email) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projects table - stores project metadata
 */
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name", { length: 255 }).notNull(),
  description: text("description"),
  workspaceId: integer("workspaceId").notNull().default(0),
  ownerId: integer("ownerId").notNull(),
  visibility: text("visibility").default("private").notNull(), // "private" | "org"
  status: text("status").default("active").notNull(),
  archivedAt: text("archivedAt"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (t) => ({ workspaceIdx: index("projects_workspace_idx").on(t.workspaceId) }));

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Project members - team collaboration
 */
export const projectMembers = sqliteTable("projectMembers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  userId: integer("userId").notNull(),
  role: text("role").default("member").notNull(),
  phone: text("phone", { length: 20 }),
  notes: text("notes"),
  joinedAt: text("joinedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = typeof projectMembers.$inferInsert;

/**
 * Kanban columns - customizable board columns
 */
export const kanbanColumns = sqliteTable("kanbanColumns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  order: integer("order").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type KanbanColumn = typeof kanbanColumns.$inferSelect;
export type InsertKanbanColumn = typeof kanbanColumns.$inferInsert;

/**
 * Tasks - main task entity
 */
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  columnId: integer("columnId").notNull(),
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  assigneeId: integer("assigneeId"),
  creatorId: integer("creatorId").notNull(),
  priority: text("priority").default("medium").notNull(),
  dueDate: text("dueDate"),
  completedAt: text("completedAt"),
  order: integer("order").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  projectIdx: index("tasks_project_idx").on(t.projectId),
  columnIdx: index("tasks_column_idx").on(t.columnId),
}));

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Subtasks - nested tasks within main tasks
 */
export const subtasks = sqliteTable("subtasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  title: text("title", { length: 255 }).notNull(),
  completed: integer("completed", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Subtask = typeof subtasks.$inferSelect;
export type InsertSubtask = typeof subtasks.$inferInsert;

/**
 * Task comments - discussion threads
 */
export const taskComments = sqliteTable("taskComments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  authorId: integer("authorId").notNull(),
  content: text("content").notNull(),
  mentions: text("mentions", { mode: "json" }).$type<number[]>(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = typeof taskComments.$inferInsert;

/**
 * File snapshots - version-controlled file storage
 */
export const fileSnapshots = sqliteTable("fileSnapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId"),
  projectId: integer("projectId"),
  fileName: text("fileName", { length: 255 }).notNull(),
  fileKey: text("fileKey", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileSize: integer("fileSize"),
  mimeType: text("mimeType", { length: 100 }),
  uploadedBy: integer("uploadedBy").notNull(),
  version: integer("version").notNull().default(1),
  notes: text("notes"),
  recordDate: text("recordDate"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type FileSnapshot = typeof fileSnapshots.$inferSelect;
export type InsertFileSnapshot = typeof fileSnapshots.$inferInsert;

/**
 * Vendors - supplier information
 */
export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Vendor = typeof vendors.$inferSelect;
export type InsertVendor = typeof vendors.$inferInsert;

/**
 * Vendor contacts - contact persons for vendors
 */
export const vendorContacts = sqliteTable("vendorContacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vendorId: integer("vendorId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  phone: text("phone", { length: 20 }),
  landline: text("landline", { length: 20 }),
  email: text("email", { length: 320 }),
  role: text("role").default("other").notNull(),
  notes: text("notes"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type VendorContact = typeof vendorContacts.$inferSelect;
export type InsertVendorContact = typeof vendorContacts.$inferInsert;

/**
 * Cost entries - expense tracking
 */
export const costEntries = sqliteTable("costEntries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  amount: real("amount").notNull(),
  amountCents: integer("amount_cents"), // v4.1 T4: 整数分, 与 amount 同步
  category: text("category", { length: 100 }).notNull(),
  notes: text("notes"),
  vendorId: integer("vendorId"),
  date: text("date")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  createdBy: integer("createdBy").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type CostEntry = typeof costEntries.$inferSelect;
export type InsertCostEntry = typeof costEntries.$inferInsert;

/**
 * Revenue entries - income tracking (销售收入/服务费等)
 */
export const revenueEntries = sqliteTable("revenueEntries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  amount: real("amount").notNull(),
  amountCents: integer("amount_cents"), // v4.1 T4: 整数分, 与 amount 同步
  category: text("category", { length: 100 }).notNull(),
  notes: text("notes"),
  customerId: integer("customerId"),
  date: text("date")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  createdBy: integer("createdBy").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type RevenueEntry = typeof revenueEntries.$inferSelect;
export type InsertRevenueEntry = typeof revenueEntries.$inferInsert;

/**
 * Expense entries - operating expenses (办公/差旅/工资等)
 */
export const expenseEntries = sqliteTable("expenseEntries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  amount: real("amount").notNull(),
  amountCents: integer("amount_cents"), // v4.1 T4: 整数分, 与 amount 同步
  category: text("category", { length: 100 }).notNull(),
  notes: text("notes"),
  date: text("date")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  createdBy: integer("createdBy").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type ExpenseEntry = typeof expenseEntries.$inferSelect;
export type InsertExpenseEntry = typeof expenseEntries.$inferInsert;

/**
 * Project milestones - important dates and events
 */
export const milestones = sqliteTable("milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: text("dueDate").notNull(),
  completed: integer("completed", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Milestone = typeof milestones.$inferSelect;
export type InsertMilestone = typeof milestones.$inferInsert;

/**
 * Accounting accounts (chart of accounts)
 */
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // asset/liability/equity/income/expense
  parentId: integer("parentId"),
  cashFlowCategory: text("cashFlowCategory"), // operating/investing/financing
  balance: real("balance").notNull().default(0),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/**
 * Journal entries (double-entry bookkeeping)
 */
export const journalEntries = sqliteTable("journalEntries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  debitAccountId: integer("debitAccountId").notNull(),
  debitAmount: real("debitAmount").notNull(),
  debitAmountCents: integer("debit_amount_cents"),
  creditAccountId: integer("creditAccountId").notNull(),
  creditAmount: real("creditAmount").notNull(),
  creditAmountCents: integer("credit_amount_cents"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type JournalEntry = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

// FP-01: 财智财务模块 — budgets / closings 表
export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  accountId: integer("accountId").notNull(),
  period: text("period").notNull(),
  amount: real("amount").notNull(),
  amountCents: integer("amount_cents"), // v4.1 T4: 整数分, 与 amount 同步
  createdAt: text("createdAt").notNull().$defaultFn(() => new Date().toISOString()),
}, (t) => ({ unq: unique().on(t.projectId, t.accountId, t.period) }));

export const closings = sqliteTable("closings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  period: text("period").notNull(),
  closedBy: integer("closedBy").notNull(),
  approvedBy: integer("approvedBy"),
  approvedAt: text("approvedAt"),
  netIncome: real("netIncome").notNull(),
  netIncomeCents: integer("net_income_cents"), // v4.1 T4
  entryCount: integer("entryCount").notNull(),
  summary: text("summary"),
  closedAt: text("closedAt").notNull(),
}, (t) => ({ unq: unique().on(t.projectId, t.period), projectIdx: index("closings_project_idx").on(t.projectId) }));

/**
 * Customers (sales parties / clients)
 */
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * Customer contacts - up to 5 per customer
 */
export const customerContacts = sqliteTable("customerContacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customerId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  phone: text("phone", { length: 20 }),
  landline: text("landline", { length: 20 }),
  email: text("email", { length: 320 }),
  role: text("role").default("other").notNull(),
  notes: text("notes"),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type CustomerContact = typeof customerContacts.$inferSelect;
export type InsertCustomerContact = typeof customerContacts.$inferInsert;

/**
 * Integrations webhooks - stores third-party service connections
 */
export const webhooks = sqliteTable("webhooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  name: text("name", { length: 255 }).notNull(),
  platform: text("platform", { length: 64 }).notNull(),
  webhookUrl: text("webhookUrl", { length: 512 }).notNull(),
  config: text("config"),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

/**
 * In-app notifications - activity feed
 */
export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("projectId").notNull(),
  userId: integer("userId").notNull(),
  type: text("type", { length: 50 }).notNull(), // task_created | task_completed | cost_added | file_uploaded | milestone_due
  title: text("title", { length: 255 }).notNull(),
  body: text("body"),
  link: text("link", { length: 512 }), // 可选跳转链接
  read: integer("read", { mode: "boolean" }).default(false).notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  projectIdx: index("notif_project_idx").on(t.projectId),
  userIdx: index("notif_user_idx").on(t.userId),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ============================================================
// Bot 多用户上下文 — 每个平台用户对应一行
// ============================================================
export const botUserContext = sqliteTable("bot_user_context", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform", { length: 20 }).notNull(), // "wecom" | "dingtalk"
  platformUserId: text("platformUserId", { length: 128 }).notNull(),
  chronosUserId: integer("chronosUserId").notNull(),
  currentProjectId: integer("currentProjectId").notNull().default(1),
  lastCommand: text("lastCommand"),
  tempData: text("tempData"), // JSON
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type BotUserContext = typeof botUserContext.$inferSelect;

// ============================================================
// Bot 登录验证码 — 一次性 6 位数字，5 分钟过期
// ============================================================
export const botAuthCodes = sqliteTable("bot_auth_codes", {
  code: text("code", { length: 6 }).primaryKey(),
  chronosUserId: integer("chronosUserId").notNull(),
  expiresAt: text("expiresAt").notNull(),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ============================================================
// 多租户 — 工作区
// ============================================================
export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name", { length: 255 }).notNull(),
  slug: text("slug", { length: 64 }).notNull().unique(),
  createdBy: integer("createdBy").notNull(),
  status: text("status").notNull().default("active"), // active | suspended | archived
  settings: text("settings"), // JSON: { allowMemberCreateProject, defaultProjectVisibility }
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updatedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Workspace = typeof workspaces.$inferSelect;

export const workspaceMembers = sqliteTable("workspace_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  role: text("role", { length: 20 }).notNull().default("member"),
  status: text("status", { length: 20 }).notNull().default("active"), // active | pending | suspended | removed
  invitedBy: integer("invitedBy"),
  invitedAt: text("invitedAt"),
  joinedAt: text("joinedAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (t) => ({
  wsIdx: index("wm_workspace_idx").on(t.workspaceId),
  userIdx: index("wm_user_idx").on(t.userId),
}));

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

// ============================================================
// 审计日志 — 谁何时对哪条记录做了什么操作
// ============================================================
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspaceId").notNull(),
  projectId: integer("projectId"),
  userId: integer("userId").notNull(),
  action: text("action", { length: 20 }).notNull(), // create | update | delete | login | logout | permission_denied
  entity: text("entity", { length: 50 }).notNull(), // costs | tasks | users...
  entityId: integer("entityId").notNull(),
  changes: text("changes"), // JSON: { before: {...}, after: {...} }
  ip: text("ip", { length: 50 }),
  createdAt: text("createdAt")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (t) => ({ workspaceIdx: index("audit_workspace_idx").on(t.workspaceId) }));

export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================
// RBAC 权限体系 — 细粒度 authorization
// ============================================================
export const permissions = sqliteTable("permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  resource: text("resource", { length: 50 }).notNull(), // project | task | finance | member | workspace
  action: text("action", { length: 50 }).notNull(),      // create | read | update | delete | view | edit | invite
  description: text("description"),
});

export type Permission = typeof permissions.$inferSelect;

export const rolePermissions = sqliteTable("role_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role", { length: 20 }).notNull(), // owner | admin | member | viewer
  permissionId: integer("permissionId").notNull(),
});

export type RolePermission = typeof rolePermissions.$inferSelect;

/* ──────────── Phase 8 · AI Agent 表 ──────────── */

/** ai_runs — AI 执行记录 (状态机) */
export const aiRuns = sqliteTable("ai_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  workspaceId: integer("workspaceId").notNull(),
  projectId: integer("projectId"),
  status: text("status").notNull().default("planning"),
  // planning | pending | executing | completed | failed | cancelled
  plan: text("plan").notNull(),                        // JSON: Plan
  idempotencyKey: text("idempotency_key").notNull(),   // 幂等键 (UUID)
  promptVersion: text("prompt_version").notNull().default("v1"),
  schemaVersion: integer("schema_version").notNull().default(1),
  createdVia: text("created_via").notNull().default("AI"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type AIRun = typeof aiRuns.$inferSelect;
export type InsertAIRun = typeof aiRuns.$inferInsert;

/** ai_execution_logs — 单次 LLM 调用日志 */
export const aiExecutionLogs = sqliteTable("ai_execution_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull().default("v1"),
  schemaVersion: integer("schema_version").notNull().default(1),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cost: real("cost").notNull().default(0),
  status: text("status").notNull().default("success"),  // success | error
  error: text("error"),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export type AIExecutionLog = typeof aiExecutionLogs.$inferSelect;
export type InsertAIExecutionLog = typeof aiExecutionLogs.$inferInsert;

// v4.0 bot_inbox — 机器人文件收件箱
export const botInbox = sqliteTable("bot_inbox", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  botUserId: text("bot_user_id").notNull(),
  webUserId: integer("web_user_id"),
  workspaceId: integer("workspace_id"),
  projectId: integer("project_id"),
  originalName: text("original_name").notNull(),
  mime: text("mime"),
  size: integer("size"),
  tempPath: text("temp_path").notNull(),
  status: text("status").notNull().default("pending"),
  receivedAt: integer("received_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  committedAt: integer("committed_at"),
});
export type BotInboxItem = typeof botInbox.$inferSelect;
export type InsertBotInboxItem = typeof botInbox.$inferInsert;

export { activityEvents, userSessions };
export { featureFlags } from "../server/db/featureFlags";
