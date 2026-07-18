import { db, eq, and } from "../db/connection";
import {
  projectMembers,
  workspaceMembers,
  projects,
  tasks,
  fileSnapshots,
  costEntries,
  revenueEntries,
  expenseEntries,
  vendors,
  customers,
  milestones,
} from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

/**
 * 按实体ID解析projectId → 校验workspace成员 → 返回权限
 * 消31处IDOR · 对所有entity操作统一出入口
 */
export async function requireEntityAccess(
  entityType:
    | "task"
    | "file"
    | "cost"
    | "revenue"
    | "expense"
    | "vendor"
    | "customer"
    | "milestone",
  entityId: number,
  userId: number
) {
  const tableMap = {
    task: tasks,
    file: fileSnapshots,
    cost: costEntries,
    revenue: revenueEntries,
    expense: expenseEntries,
    vendor: vendors,
    customer: customers,
    milestone: milestones,
  } as const;
  const table = tableMap[entityType];
  // @note: Drizzle SQLite table types differ per entity, so we unify via runtime access.
  // This is safer than scattered `as any` elsewhere — single point of control.
  const row = db
    .select({ projectId: (table as any).projectId })
    .from(table)
    .where(eq((table as any).id, entityId))
    .get() as { projectId: number } | undefined;
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `${entityType} not found`,
    });
  return requireProjectAccess(userId, row.projectId);
}

/**
 * 项目访问控制
 * - workspace member+ 自动可以读取 workspace 内所有项目
 * - 项目级细粒度权限（编辑/删除）由调用方额外检查
 */
export async function requireProjectAccess(userId: number, projectId: number) {
  // 查项目所属 workspace
  const project = db
    .select({
      workspaceId: projects.workspaceId,
      visibility: projects.visibility,
      ownerId: projects.ownerId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }

  // 第一层: workspace 隔离 — 用户必须在项目所属的 workspace 里
  const wsMember = db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, project.workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .get();
  if (!wsMember) {
    throw new TRPCError({
      code: "NOT_FOUND", // v3.9.2: 403→404 消除信息泄露, 与bot侧口径一致
      message: "Workspace not found",
    });
  }

  // 第二层: workspace member+ 有读权限
  // 项目 owner 不需要 projectMembers 记录
  if (project.ownerId === userId) {
    return { workspaceRole: wsMember.role, projectRole: "owner" };
  }

  // admin/owner workspace 角色可访问所有项目
  if (wsMember.role === "admin" || wsMember.role === "owner") {
    return { workspaceRole: wsMember.role, projectRole: "admin" };
  }

  // member: 必须是项目成员 或 项目是 org visibility
  const projMember = db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId)
      )
    )
    .get();
  if (projMember) {
    return { workspaceRole: wsMember.role, projectRole: projMember.role };
  }

  // org visibility 公开给 workspace 成员
  if (project.visibility === "org") {
    return { workspaceRole: wsMember.role, projectRole: "viewer" };
  }

  // 非项目成员 → 拒绝访问 (NOT_FOUND 消除信息泄露)
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Project not found",
  });
}
