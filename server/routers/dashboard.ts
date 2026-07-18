// dashboard routes — C1 God File split
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

export const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    return db.getDashboardStats(ctx.user.id);
  }),
});
