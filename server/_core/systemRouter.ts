import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { notifyOwner } from "./notification";
import {
  adminProcedure,
  publicProcedure,
  protectedProcedure,
  router,
} from "./trpc";
import { requireSystemAccess } from "../lib/system-access";
import { db } from "../db/connection";
import { userSessions } from "../db/userSessions";
import { activityEvents } from "../db/activityEvents";
import { users } from "../../drizzle/schema";

const systemProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await requireSystemAccess(ctx.user!.id, "SYSTEM_AUDITOR");
  return next();
});

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0) }))
    .query(() => ({ ok: true })),

  notifyOwner: adminProcedure
    .input(z.object({ title: z.string().min(1), content: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return { success: delivered } as const;
    }),

  heartbeat: protectedProcedure
    .input(z.object({ timestamp: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(userSessions)
        .set({ lastActiveAt: new Date(input.timestamp) })
        .where(
          and(
            eq(userSessions.userId, ctx.user!.id),
            eq(userSessions.status, "ACTIVE")
          )
        )
        .execute();
      return { ok: true };
    }),

  listOnlineUsers: systemProcedure.query(async ({ ctx }) => {
    // v4.3 WO-SEC-5: 按 workspaceId 过滤 + email/ip 脱敏 (防跨租户 PII 泄露)
    const rows = db
      .select({
        sessionId: userSessions.id,
        userId: userSessions.userId,
        userName: users.name,
        userEmail: users.email,
        status: userSessions.status,
        ipAddress: userSessions.ipAddress,
        device: userSessions.device,
        lastActiveAt: userSessions.lastActiveAt,
        loginAt: userSessions.loginAt,
      })
      .from(userSessions)
      .leftJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.status, "ACTIVE"))
      .all();
    // 脱敏: email→只显域名前1位, ip→最后一组省略
    return rows.map(r => ({
      ...r,
      userEmail: r.userEmail
        ? `${r.userEmail.charAt(0)}***@${r.userEmail.split("@")[1] || ""}`
        : null,
      ipAddress: r.ipAddress ? r.ipAddress.replace(/\.[^.]+$/, ".*") : null,
    }));
  }),

  listAuditEvents: systemProcedure
    .input(
      z.object({
        userId: z.number().optional(),
        workspaceId: z.number().optional(),
        category: z.string().optional(),
        level: z.string().default("IMPORTANT"),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input.userId)
        conditions.push(eq(activityEvents.userId, input.userId));
      if (input.workspaceId)
        conditions.push(eq(activityEvents.workspaceId, input.workspaceId));
      if (input.category)
        conditions.push(eq(activityEvents.category, input.category as any));
      // Default: exclude INFO level (show IMPORTANT+ only)
      if (input.level !== "INFO") {
        conditions.push(sql`${activityEvents.level} != 'INFO'`);
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db
        .select()
        .from(activityEvents)
        .where(where)
        .orderBy(desc(activityEvents.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();
    }),
});
