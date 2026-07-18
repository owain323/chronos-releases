// notifications routes — C1 God File split
import { z } from "zod";
import { protectedProcedure, router, workspaceProcedure } from "../_core/trpc";
import { requireProjectAccess } from "../lib/project-guard";

export const notificationsRouter = router({
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return (await import("../lib/notifications")).getNotifications(
        input.projectId
      );
    }),

  getUnreadCount: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return (await import("../lib/notifications")).getUnreadCount(
        input.projectId
      );
    }),

  // workspace 维度：聚合当前 workspace（ctx.workspaceId，来自 x-workspace-id）下所有项目
  getByWorkspace: workspaceProcedure.query(async ({ ctx }) => {
    return (await import("../lib/notifications")).getWorkspaceNotifications(
      ctx.workspaceId!
    );
  }),

  getWorkspaceUnreadCount: workspaceProcedure.query(async ({ ctx }) => {
    return (await import("../lib/notifications")).getWorkspaceUnreadCount(
      ctx.workspaceId!
    );
  }),

  markAllReadByWorkspace: workspaceProcedure.mutation(async ({ ctx }) => {
    return (await import("../lib/notifications")).markAllWorkspaceRead(
      ctx.workspaceId!
    );
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the notification belongs to a project the user can access
      const ns = await import("../lib/notifications");
      const notification = await ns.getNotificationById(input.id);
      if (notification) {
        await requireProjectAccess(ctx.user.id, notification.projectId);
      }
      return ns.markRead(input.id);
    }),

  markAllRead: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return (await import("../lib/notifications")).markAllRead(
        input.projectId
      );
    }),
});
