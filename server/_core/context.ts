import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { TRPCError } from "@trpc/server";
import type { Response } from "express";
import * as db from "../db";
import { verifyToken } from "../routers/auth";
import { workspaceMembers } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { reqLogger } from "../lib/logger";
import type { RequestWithRequestId } from "../lib/request-context";

export type TrpcContext = {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  } | null;
  workspaceId: number | null;
  workspaceRole: "owner" | "admin" | "member" | "viewer" | null;
  ip: string; // 客户端 IP — 用于限流
  res: Response; // Express Response — 用于设 httpOnly cookie
  source: "user" | "bot" | "agent"; // 调用来源 — AI Agent 权限判定依据
  requestId: string; // V3.8: 链路追踪 ID，下游日志可关联
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  type ReqWithCookies = typeof opts.req & { cookies: Record<string, string> };
  const req = opts.req as ReqWithCookies;
  const requestId = (req as RequestWithRequestId).requestId || "unknown";
  const emptyCtx: TrpcContext = {
    user: null,
    workspaceId: null,
    workspaceRole: null,
    res: opts.res,
    ip: req.ip || "0.0.0.0",
    source: "user",
    requestId,
  };

  // 优先 httpOnly cookie（防 XSS 窃取），回退 Authorization header
  let token: string | null = null;
  const cookieToken = req.cookies?.token;
  if (cookieToken) {
    token = cookieToken;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
  }
  if (!token) return emptyCtx;

  const payload = verifyToken(token);
  if (!payload) {
    reqLogger().error(
      `[context] verifyToken failed, token.length=${token.length}`
    );
    return emptyCtx;
  }

  try {
    const dbUser = await db.getUserById(payload.uid);
    if (!dbUser) {
      reqLogger().error(`[context] user not found: uid=${payload.uid}`);
      return emptyCtx;
    }
    {
      const dbTv = dbUser.tokenVersion ?? 0;
      if (dbTv !== (payload.tv ?? 0)) {
        reqLogger().error(
          `[context] tokenVersion mismatch: db=${dbTv} jwt=${payload.tv} uid=${payload.uid}`
        );
        return emptyCtx;
      }

      // 从请求 header 或 cookie 读取当前 workspaceId（不写在 JWT 里）
      const headerWsId = req.headers["x-workspace-id"];
      const cookieWsId = req.cookies?.workspaceId;
      const rawId = headerWsId || cookieWsId;
      let workspaceId = rawId ? Number(rawId) : null;

      // 验证用户在 workspace 中的成员身份 + 角色
      let workspaceRole: TrpcContext["workspaceRole"] = null;
      if (workspaceId) {
        const db2 = await import("../db/connection").then(m => m.db);
        const member = db2
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, workspaceId),
              eq(workspaceMembers.userId, dbUser.id)
            )
          )
          .get();
        if (member) {
          workspaceRole = member.role as TrpcContext["workspaceRole"];
        } else {
          // v4.3 WO-SEC-1: 非成员 → 清 workspaceId, 触发 fallback 到用户自己的工作区
          workspaceId = null;
        }
      }

      // R8: workspaceId 缺失时自动 fallback 到用户第一个 workspace
      let finalWorkspaceId = workspaceId;
      if (!finalWorkspaceId) {
        console.warn(
          "[Context] workspaceId missing — falling back to first workspace"
        );
        const db2 = await import("../db/connection").then(m => m.db);
        const first = db2
          .select({
            id: workspaceMembers.workspaceId,
            role: workspaceMembers.role,
          })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.userId, dbUser.id))
          .get();
        if (first) {
          finalWorkspaceId = first.id;
          workspaceRole = first.role as TrpcContext["workspaceRole"];
        }
      }

      return {
        user: {
          id: dbUser.id,
          name: dbUser.name || "",
          email: dbUser.email || "",
          role: dbUser.role || "user",
          displayName: (dbUser as any).displayName || null,
          avatarUrl: (dbUser as any).avatarUrl || null,
        },
        workspaceId: finalWorkspaceId,
        workspaceRole,
        res: opts.res,
        ip: req.ip || "0.0.0.0",
        source: "user",
        requestId,
      };
    }
  } catch (err) {
    // 权限类错误（如生产环境缺 workspaceId 的 BAD_REQUEST）必须透出，
    // 不能吞成 emptyCtx 退化为 401
    if (err instanceof TRPCError) throw err;
    reqLogger().error(
      `[ctx:${Date.now()}] user lookup failed: ${(err as Error).message} uid=${payload?.uid}`
    );
  }

  return emptyCtx;
}
