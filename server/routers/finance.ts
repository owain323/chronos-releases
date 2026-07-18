// finance routes — C1 God File split
import { z } from "zod";
import { permissionProcedure, router } from "../_core/trpc";
import { requireProjectAccess } from "../lib/project-guard";
import * as db from "../db";

export const financeRouter = router({
  getSummary: permissionProcedure("finance.view")
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.user.id, input.projectId);
      return db.getFinanceSummary(input.projectId);
    }),
});
