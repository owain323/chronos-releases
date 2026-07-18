// webhooks routes — C1 God File split
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireProjectAccess } from "../lib/project-guard";
import * as db from "../db";

export const webhooksRouter = router({
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.getWebhooksByProjectId(input.projectId);
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        name: z.string().min(1),
        platform: z.string().min(1),
        webhookUrl: z
          .string()
          .url()
          .refine(u => u.startsWith("https://"), "webhookUrl must use HTTPS"),
        config: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.createWebhook(input);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const webhook = await db.getWebhookById(input.id);
      if (webhook) await requireProjectAccess(ctx.user.id, webhook.projectId);
      return db.deleteWebhook(input.id);
    }),
});
