// kanban routes — C1 God File split
import { z } from "zod";
import { protectedProcedure, permissionProcedure, router } from "../_core/trpc";
import { requireProjectAccess } from "../lib/project-guard";
import * as db from "../db";

export const kanbanRouter = router({
  getColumns: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.getKanbanColumnsByProjectId(input.projectId);
    }),

  createColumn: permissionProcedure("project.update")
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1),
        order: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.createKanbanColumn(input);
    }),
});
