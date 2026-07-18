/**
 * 统一类型注册表 (当前开发环境引用，生产环境 tRPC 类型推导为主)
 * v3.1: 审计报告指出 zero references — 保留作为类型清单/文档，待组件重构时引入
 */

// === 表类型 (从Drizzle schema导出) ===
export type * from "../drizzle/schema";
export * from "./_core/errors";

// === 通用工具类型 ===

/** 财务数据摘要 (getFinanceSummary·getCostSummary 返回值) */
export interface FinanceSummary {
  totalRevenue: number;
  totalCost: number;
  totalExpense: number;
  profit: number;
}

/** 搜索响应 (search.global 返回) */
export type { SearchResults } from "../server/routers/search";

/** 权限角色 */
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/** 审计日志条目 */
export interface AuditEntry {
  userId: number;
  workspaceId: number;
  action: string;
  entity: string;
  entityId: number;
  ip?: string;
  timestamp: string;
}
