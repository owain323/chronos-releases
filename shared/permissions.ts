/**
 * RBAC 权限矩阵 — 全仓单一事实源 (Single Source of Truth)
 *
 * 服务端 (trpc.ts permissionProcedure) 与前端 (PermissionGuard)
 * 必须都从本文件 import，禁止各自硬编码。
 *
 * 权限点命名规范：`<资源>.<动词>`
 * 动词收敛为：view / edit / create / delete / manage
 *   - read → view（同义词已收敛，见 LEGACY_ALIASES）
 *   - update → edit（同义词已收敛）
 *   - member.invite / member.remove / member.updateRole → member.manage
 * 财务域采用既有约定：finance.view / finance.edit
 */

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/** 规范化后的完整权限点（owner 用 "*" 通配） */
export type Permission = string;

/**
 * 角色 → 权限 矩阵（唯一权威定义）
 *
 * | 权限点            | owner | admin | member | viewer |
 * |-------------------|-------|-------|--------|--------|
 * | workspace.view    |   *   |   ✓   |   ✓    |   ✓    |
 * | workspace.edit    |   *   |   ✓   |   —    |   —    |
 * | workspace.delete  |   *   |   —   |   —    |   —    |
 * | project.view      |   *   |   ✓   |   ✓    |   ✓    |
 * | project.create    |   *   |   ✓   |   ✓    |   —    |
 * | project.edit      |   *   |   ✓   |   —    |   —    |
 * | project.delete    |   *   |   ✓   |   —    |   —    |
 * | task.view         |   *   |   ✓   |   ✓    |   ✓    |
 * | task.create       |   *   |   ✓   |   ✓    |   —    |
 * | task.edit         |   *   |   ✓   |   ✓    |   —    |
 * | task.delete       |   *   |   ✓   |   —    |   —    |
 * | finance.view      |   *   |   ✓   |   —    |   —    |
 * | finance.edit      |   *   |   ✓   |   —    |   —    |
 * | member.manage     |   *   |   ✓   |   —    |   —    |
 * | audit.view        |   *   |   ✓   |   —    |   —    |
 *
 * 设计要点：
 * - member 无任何财务权限（T3 P0 最小权限原则）
 * - viewer 全只读
 * - workspace.delete 仅 owner（admin 不可删工作区）
 */
export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  owner: ["*"],
  admin: [
    "workspace.view",
    "workspace.edit",
    "project.view",
    "project.create",
    "project.edit",
    "project.delete",
    "task.view",
    "task.create",
    "task.edit",
    "task.delete",
    "finance.view",
    "finance.edit",
    "member.manage",
    "audit.view",
  ],
  member: [
    "workspace.view",
    "project.view",
    "project.create",
    "task.view",
    "task.create",
    "task.edit",
    // 无 finance.* — 财务数据仅 admin+ 可见
  ],
  viewer: [
    "workspace.view",
    "project.view",
    "task.view",
    // 全只读，无任何写权限、无财务权限
  ],
} as const;

/**
 * 旧权限点 → 规范化权限点 别名表。
 * 用于兼容尚未迁移的调用方（如 kanban.ts 的 "project.update"、
 * PolicyEngine 的 "member.invite"），新代码必须直接使用规范名。
 */
const EXACT_ALIASES: Record<string, string> = {
  "member.invite": "member.manage",
  "member.remove": "member.manage",
  "member.updateRole": "member.manage",
};

/** 动词级同义词收敛：read→view, update→edit */
const VERB_ALIASES: Record<string, string> = {
  read: "view",
  update: "edit",
};

/** 将旧写法权限点收敛为规范名（幂等：规范名原样返回） */
export function normalizePermission(permission: string): string {
  const exact = EXACT_ALIASES[permission];
  if (exact) return exact;
  const dot = permission.indexOf(".");
  if (dot < 0) return permission;
  const verb = permission.slice(dot + 1);
  const alias = VERB_ALIASES[verb];
  return alias ? `${permission.slice(0, dot)}.${alias}` : permission;
}

/**
 * 判断角色是否拥有指定权限（纯函数，服务端/前端共用，结果一致）。
 * role 为 null/未知时 fail-closed。
 */
export function hasPermission(
  role: string | null | undefined,
  permission: string
): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as WorkspaceRole];
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(normalizePermission(permission));
}

/** 返回角色的完整规范化权限列表（owner 返回 ["*"]） */
export function permissionsForRole(
  role: string | null | undefined
): readonly Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role as WorkspaceRole] ?? [];
}
