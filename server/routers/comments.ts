// comments routes — C1 God File split
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireEntityAccess } from "../lib/project-guard";
import * as db from "../db";

export const commentsRouter = router({
  getByTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireEntityAccess("task", input.taskId, ctx.user.id);
      return db.getCommentsByTaskId(input.taskId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        content: z.string().min(1),
        mentions: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireEntityAccess("task", input.taskId, ctx.user.id);
      return db.createTaskComment({
        taskId: input.taskId,
        authorId: ctx.user.id,
        content: input.content,
        mentions: input.mentions,
      });
    }),
});
