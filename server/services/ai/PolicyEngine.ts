/**
 * PolicyEngine — AI 指令的安全门
 *
 * 红线:
 * ④ PolicyEngine 只读 Command · 不读 Prompt (Prompt Injection 防线)
 * ① risk_level 不由 AI 输出 → PolicyEngine 硬编码
 * ② required_permissions 不由 AI 输出 → PolicyEngine 硬编码
 */
import type { AICommand, PolicyDecision } from "./types";

/** 每种 action 的硬编码风险等级 */
const ACTION_RISK: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  create_project: "LOW",
  create_task: "LOW",
  update_task: "MEDIUM",
  delete_task: "MEDIUM",
  delete_project: "CRITICAL",
  create_cost_entry: "MEDIUM",
  create_revenue_entry: "MEDIUM",
  invite_member: "HIGH",
  remove_member: "HIGH",
};

/** 每种 action 的硬编码权限要求 */
const ACTION_PERMISSIONS: Record<string, string> = {
  create_project: "project.create",
  create_task: "task.create",
  update_task: "task.update",
  delete_task: "task.delete",
  delete_project: "project.delete",
  create_cost_entry: "finance.edit",
  create_revenue_entry: "finance.edit",
  invite_member: "member.invite",
  remove_member: "member.remove",
};

/** 角色权限映射 (复用 trpc.ts 的逻辑) */
const ROLE_LEVEL: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

/**
 * 评估单个 AI Command
 * @returns ALLOW / DENY / REQUIRE_APPROVAL
 */
export function evaluate(
  command: AICommand,
  workspaceRole: string
): PolicyDecision {
  const risk = ACTION_RISK[command.action] ?? "MEDIUM";
  const requiredPerm = ACTION_PERMISSIONS[command.action];
  const roleLevel = ROLE_LEVEL[workspaceRole] ?? 0;

  // 未知 action → 拒绝
  if (!requiredPerm) return "DENY";

  // viewer 永远拒绝
  if (workspaceRole === "viewer") return "DENY";

  // CRITICAL 风险 → 仅 owner 允许
  if (risk === "CRITICAL" && workspaceRole === "owner") return "ALLOW";
  if (risk === "CRITICAL") return "DENY";

  // HIGH 风险 → owner/admin 允许, member 需要审批
  if (risk === "HIGH" && roleLevel >= 3) return "ALLOW";
  if (risk === "HIGH" && roleLevel === 2) return "REQUIRE_APPROVAL";

  // MEDIUM → member+
  if (risk === "MEDIUM" && roleLevel >= 2) return "ALLOW";

  // LOW → viewer+ (但 viewer 已在上面拒绝)
  if (risk === "LOW") return "ALLOW";

  return "DENY";
}

/**
 * 批量评估 Plan 中的所有 Commands
 * 只要有一个 DENY → 整体 DENY
 * 只要有一个 REQUIRE_APPROVAL → 整体 REQUIRE_APPROVAL
 */
export function evaluatePlan(
  commands: AICommand[],
  workspaceRole: string
): PolicyDecision {
  let hasApproval = false;
  for (const cmd of commands) {
    const result = evaluate(cmd, workspaceRole);
    if (result === "DENY") return "DENY";
    if (result === "REQUIRE_APPROVAL") hasApproval = true;
  }
  return hasApproval ? "REQUIRE_APPROVAL" : "ALLOW";
}

/**
 * 获取 action 的风险等级 (用于前端展示)
 */
export function getRiskLevel(action: string): string {
  return ACTION_RISK[action] ?? "MEDIUM";
}
