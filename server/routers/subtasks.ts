// subtasks routes — C1 God File split
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  requireEntityAccess,
  requireProjectAccess,
} from "../lib/project-guard";
import { db, eq } from "../db/connection";
import { subtasks, tasks } from "../../drizzle/schema";
import * as dbApi from "../db";

export const subtasksRouter = router({
  getByTask: protectedProcedure
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireEntityAccess("task", input.taskId, ctx.user.id);
      return dbApi.getSubtasksByTaskId(input.taskId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        taskId: z.number(),
        title: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireEntityAccess("task", input.taskId, ctx.user.id);
      return dbApi.createSubtask(input);
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        subtaskId: z.number(),
        completed: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // subtaskId → taskId (via JOIN) → projectId → requireProjectAccess
      const row = db
        .select({ projectId: tasks.projectId })
        .from(subtasks)
        .innerJoin(tasks, eq(subtasks.taskId, tasks.id))
        .where(eq(subtasks.id, input.subtaskId))
        .get();
      if (!row) throw new Error("Subtask not found");
      await requireProjectAccess(ctx.user.id, row.projectId);
      return dbApi.updateSubtaskStatus(input.subtaskId, input.completed);
    }),
});
