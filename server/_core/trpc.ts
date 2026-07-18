import { initTRPC, TRPCError } from "@trpc/server";
import { hasPermission } from "@shared/permissions";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// 需要认证 — 检查 ctx.user 是否已登录
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// 需要工作区上下文 — 检查 ctx.workspaceId
export const workspaceProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "未选择工作区" });
  }
  // v4.3 WO-SEC-1: 二手校验 — 非成员拒绝
  if (!ctx.workspaceRole) {
    throw new TRPCError({ code: "FORBIDDEN", message: "非工作区成员" });
  }
  return next({ ctx });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (
    ctx.workspaceRole !== "admin" &&
    ctx.workspaceRole !== "owner" &&
    ctx.user.role !== "admin"
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  }
  return next({ ctx });
});

// 权限矩阵单一事实源：shared/permissions.ts（与前端 PermissionGuard 共用，禁止本地硬编码）

// RBAC 权限 procedure — 检查角色是否拥有指定权限
export function permissionProcedure(permission: string) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!hasPermission(ctx.workspaceRole, permission)) {
      // 审计记录权限拒绝事件
      import("../lib/audit")
        .then(({ recordAudit }) => {
          recordAudit({
            userId: ctx.user!.id,
            workspaceId: ctx.workspaceId ?? 0,
            action: "permission_denied",
            entity: permission,
            entityId: ctx.user!.id,
          });
        })
        .catch((err: unknown) =>
          console.error("[permission] audit record failed:", err)
        );
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `缺少权限: ${permission}`,
      });
    }
    return next({ ctx });
  });
}
