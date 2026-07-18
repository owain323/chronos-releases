// server/routers/projects.ts — 项目路由 (从 routers.ts 抽出 T9 v4.0)
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { requireProjectAccess } from "../lib/project-guard";
import { recordAudit } from "../lib/audit";
import { createProject } from "../services/ProjectService";

export const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.workspaceId && !ctx.workspaceRole) return [];
    return db.getProjectsByUserId(
      ctx.user.id,
      ctx.workspaceId,
      ctx.workspaceRole
    );
  }),
  getById: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.getProjectById(input.projectId);
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        visibility: z.enum(["private", "org"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.workspaceId) throw new Error("未选择工作区");
      const project = await createProject(input, ctx.user.id, ctx.workspaceId);
      const pid = project.id ?? 0;
      if (pid)
        await db.addProjectMember({
          projectId: pid,
          userId: ctx.user.id,
          role: "owner",
        });
      return project;
    }),
  update: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const p = await db.getProjectById(input.projectId);
      if (!p) throw new Error("项目不存在");
      const isOwner = (p as { ownerId: number }).ownerId === ctx.user.id;
      const isAdmin =
        ctx.workspaceRole === "admin" || ctx.workspaceRole === "owner";
      if (!isOwner && !isAdmin) throw new Error("仅项目 Owner 或管理员可修改");
      await db.updateProject(input.projectId, {
        name: input.name || p.name,
        description: input.description ?? p.description,
      });
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        projectId: input.projectId,
        action: "update",
        entity: "project",
        entityId: input.projectId,
        before: { name: p.name },
        after: { name: input.name || p.name },
      });
      return { ok: true };
    }),
  delete: protectedProcedure
    .input(z.object({ projectId: z.number(), confirmName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const p = await db.getProjectById(input.projectId);
      if (!p) throw new Error("项目不存在");
      const isOwner = (p as { ownerId: number }).ownerId === ctx.user.id;
      const isAdmin =
        ctx.workspaceRole === "admin" || ctx.workspaceRole === "owner";
      if (!isOwner && !isAdmin)
        throw new Error("仅项目 Owner 或工作区管理员可删除");
      if (input.confirmName.trim() !== p.name)
        throw new Error("项目名称不匹配，删除取消");
      await db.archiveProject(input.projectId);
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        projectId: input.projectId,
        action: "delete",
        entity: "project",
        entityId: input.projectId,
      });
      return { ok: true };
    }),
  transferOwnership: protectedProcedure
    .input(z.object({ projectId: z.number(), newOwnerId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      const p = await db.getProjectById(input.projectId);
      if (!p) throw new Error("项目不存在");
      if ((p as { ownerId: number }).ownerId !== ctx.user.id)
        throw new Error("仅项目 Owner 可转让所有权");
      await db.transferProjectOwnership(input.projectId, input.newOwnerId);
      recordAudit({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId ?? 0,
        projectId: input.projectId,
        action: "update",
        entity: "project",
        entityId: input.projectId,
        after: { ownerId: input.newOwnerId },
      });
      return { ok: true };
    }),
  getMembers: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user!.id, input.projectId);
      return db.getProjectMembers(input.projectId);
    }),
  addMember: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        userId: z.number(),
        role: z.enum(["owner", "manager", "member"]),
        phone: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await requireProjectAccess(ctx.user.id, input.projectId);
      const ROLE_RANK: Record<string, number> = {
        viewer: 0,
        member: 1,
        manager: 2,
        admin: 3,
        owner: 3,
      };
      const myRank = ROLE_RANK[access.projectRole] ?? 0;
      if (myRank < ROLE_RANK.manager)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "仅项目 Manager 或 Owner 可添加成员",
        });
      if ((ROLE_RANK[input.role] ?? 0) >= myRank)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "不能授予不低于自身角色的项目角色",
        });
      return db.addProjectMember(input);
    }),
  updateMember: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        role: z.string().optional(),
        phone: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await db.getProjectMemberById(input.id);
      if (member) await requireProjectAccess(ctx.user.id, member.projectId);
      const { id, ...data } = input;
      return db.updateProjectMember(id, data);
    }),
  deleteMember: protectedProcedure
    .input(z.object({ id: z.number(), projectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user!.id, input.projectId);
      return db.deleteProjectMember(input.id);
    }),
});
