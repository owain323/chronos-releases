// server/routers/workspaces.ts — 从 routers.ts 抽出 (T9 v4.0)
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { requireWorkspaceMember, getWorkspaceMembership } from "../lib/workspace-guard";
import { recordAudit } from "../lib/audit";
import { signToken } from "./auth";

export const workspacesRouter = router({

    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getWorkspacesByUserId(ctx.user.id);
    }),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          slug: z.string().min(2).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const slug =
          input.slug ||
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64) ||
          "workspace";
        await db.createWorkspace({
          name: input.name,
          slug,
          createdBy: ctx.user.id,
        });
        return await db.getWorkspaceBySlug(slug);
      }),
    members: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { members } = await requireWorkspaceMember(
          input.workspaceId,
          ctx.user.id
        );
        return members;
      }),
    invite: protectedProcedure
      .input(z.object({ workspaceId: z.number(), userId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.workspaceId, ctx.user.id, {
          roles: ["owner", "admin"],
          message: "仅管理员可邀请成员",
        });
        return db.addWorkspaceMember(input.workspaceId, input.userId);
      }),
    /** 按邮箱邀请 — 查用户, 加成员, 送邮件 */
    inviteByEmail: protectedProcedure
      .input(z.object({ workspaceId: z.number(), email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.workspaceId, ctx.user.id, {
          roles: ["owner", "admin"],
          message: "仅管理员可邀请成员",
        });
        const user = await db.getUserByEmail(input.email);
        if (!user)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "该邮箱未注册 CHRONOS",
          });
        await db.addWorkspaceMember(input.workspaceId, user.id, "member");
        import("../services/EmailService")
          .then(({ sendEmail }) => {
            sendEmail({
              to: input.email,
              subject: "你被邀请加入 CHRONOS 工作区",
              text: `${ctx.user.name || "管理员"} 邀请你加入工作区。登录后即可查看。`,
            }).catch((e: unknown) => {
              console.warn("[workspaces] email side-effect:", e instanceof Error ? e.message : String(e));
            });
          })
          .catch((e: unknown) => {
            console.warn("[workspaces] import side-effect:", e instanceof Error ? e.message : String(e));
          });
        return { ok: true, userId: user.id };
      }),

    acceptInvite: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { member: existing } = await getWorkspaceMembership(
          input.workspaceId,
          ctx.user.id
        );
        if (existing) {
          const { db: db2 } = await import("../db/connection");
          const { eq, and } = await import("drizzle-orm");
          const { workspaceMembers } = await import("../../drizzle/schema");
          db2.update(workspaceMembers)
            .set({ status: "active" })
            .where(
              and(
                eq(workspaceMembers.workspaceId, input.workspaceId),
                eq(workspaceMembers.userId, ctx.user.id)
              )
            )
            .run();
        } else {
          await db.addWorkspaceMember(input.workspaceId, ctx.user.id);
        }
        recordAudit({
          userId: ctx.user.id,
          workspaceId: input.workspaceId,
          action: "update",
          entity: "workspace_invite",
          entityId: input.workspaceId,
        });
        return { ok: true };
      }),

    rejectInvite: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { db: db2 } = await import("../db/connection");
        const { eq, and } = await import("drizzle-orm");
        const { workspaceMembers } = await import("../../drizzle/schema");
        db2.delete(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .run();
        return { ok: true };
      }),
    switch: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.workspaceId, ctx.user.id, {
          message: "You are not a member of this workspace",
        });
        const user = await db.getUserById(ctx.user.id);
        return {
          token: signToken(ctx.user.id, user?.tokenVersion ?? 0),
        };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        await requireWorkspaceMember(input.id, ctx.user.id);
        const { db: db2 } = await import("../db/connection");
        const { eq } = await import("drizzle-orm");
        const { workspaces } = await import("../../drizzle/schema");
        const w = db2
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, input.id))
          .get();
        if (!w)
          throw new TRPCError({ code: "NOT_FOUND", message: "工作区不存在" });
        return w;
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).optional(),
          settings: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (ctx.workspaceRole !== "owner" && ctx.workspaceRole !== "admin")
          throw new Error("仅管理员可修改工作区");
        const { db: db2 } = await import("../db/connection");
        const { eq } = await import("drizzle-orm");
        const { workspaces } = await import("../../drizzle/schema");
        const data: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
        };
        if (input.name) data.name = input.name;
        if (input.settings !== undefined) data.settings = input.settings;
        db2.update(workspaces)
          .set(data)
          .where(eq(workspaces.id, input.id))
          .run();
        return { ok: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.workspaceRole !== "owner")
          throw new Error("仅 Owner 可删除工作区");
        const { db: db2 } = await import("../db/connection");
        const { eq } = await import("drizzle-orm");
        const { projects, workspaces } = await import("../../drizzle/schema");
        db2.update(projects)
          .set({ status: "deleted", archivedAt: new Date().toISOString() })
          .where(eq(projects.workspaceId, input.id))
          .run();
        db2.update(workspaces)
          .set({ status: "suspended", updatedAt: new Date().toISOString() })
          .where(eq(workspaces.id, input.id))
          .run();
        recordAudit({
          userId: ctx.user.id,
          workspaceId: input.id,
          action: "delete",
          entity: "workspace",
          entityId: input.id,
        });
        return { ok: true };
      }),

    leave: protectedProcedure
      .input(z.object({ workspaceId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { db: db2 } = await import("../db/connection");
        const { eq, and } = await import("drizzle-orm");
        const { workspaceMembers } = await import("../../drizzle/schema");
        const member = db2
          .select()
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .get();
        if (member && (member as any).role === "owner") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Owner cannot leave workspace. Transfer ownership first.",
          });
        }
        db2.delete(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, input.workspaceId),
              eq(workspaceMembers.userId, ctx.user.id)
            )
          )
          .run();
        return { ok: true };
      }),
});
