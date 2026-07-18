/**
 * PermissionService — 财务数据脱敏
 *
 * 角色 → 权限判定已收敛到 shared/permissions.ts（单一事实源），
 * 服务端经 trpc.ts permissionProcedure 强制执行，本文件不再保留
 * 任何本地权限映射或缓存。
 */

/**
 * 财务数据三层脱敏
 * role 轴为 workspaceRole（owner/admin/member/viewer）
 * Tier 1 (公开): name, category, date, notes — 所有角色可见
 * Tier 2 (敏感): amount, vendor/customer — admin/owner 可见
 * Tier 3 (审计): approval, audit — owner 可见
 */
export function maskFinanceData<T extends Record<string, any>>(
  data: T,
  role: string
): T {
  if (role === "owner") return data;
  const masked: any = { ...data };
  if (role !== "admin") {
    if ("amount" in masked) masked.amount = "***";
    if ("vendorName" in masked) masked.vendorName = "***";
    if ("customerName" in masked) masked.customerName = "***";
  }
  delete masked.approvalStatus;
  delete masked.auditNote;
  return masked as T;
}
