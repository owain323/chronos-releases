/**
 * 认证路由 — JWT + bcrypt
 * 支持本地密码登录，也兼容无密码的本地开发模式
 */
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db, eq, sql, and } from "../db/connection";
import { users, workspaceMembers, workspaces } from "../../drizzle/schema";
import { generateAuthCode } from "../db/bot";
import { recordAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import {
  checkRateLimit,
  peekRateLimit,
  resetRateLimit,
  checkEmailSendLimit,
} from "../lib/rate-limit";
import { config } from "../config";

const JWT_SECRET = config.auth.jwtSecret;
const TOKEN_EXPIRY = config.auth.tokenExpiry;

export function signToken(userId: number, tokenVersion?: number): string {
  return (jwt.sign as any)({ uid: userId, tv: tokenVersion ?? 0 }, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(token: string): { uid: number; tv: number } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as {
      uid: number;
      tv: number;
    };
    return payload;
  } catch {
    return null;
  }
}

export async function incrementTokenVersion(userId: number) {
  const { db: _db, eq: _eq } = await import("../db/connection");
  const { users: _users } = await import("../../drizzle/schema");
  const u = _db
    .select({ tv: _users.tokenVersion })
    .from(_users)
    .where(_eq(_users.id, userId))
    .get() as any;
  _db
    .update(_users)
    .set({ tokenVersion: (u?.tv ?? 0) + 1 } as any)
    .where(_eq(_users.id, userId))
    .execute();
}

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(2, "用户名至少 2 个字符"),
        email: z.string().email("邮箱格式不正确"),
        password: z
          .string()
          .min(12, "密码至少 12 位")
          .regex(
            /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
            "密码需包含大写、小写、数字"
          ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.ip || "0.0.0.0";
      const rlKey = `register:ip:${ip}`;
      // 只读预检（不清零失败/成功窗口，避免预检放大限流预算）
      if (!(await peekRateLimit(rlKey)))
        throw new Error("注册尝试过于频繁，请 15 分钟后重试");
      // 记录本次合法尝试（占用成功窗口额度）
      await checkRateLimit(rlKey, false);
      const existing = db
        .select()
        .from(users)
        .where(eq(users.email, input.email || ""))
        .limit(1)
        .all();
      if (existing.length > 0 && input.email) {
        // 防用户枚举侧信道：与 forgotPassword 策略对齐，返回模糊化提示
        throw new Error("该邮箱不可用");
      }
      const hash = await bcrypt.hash(input.password, config.auth.bcryptRounds);
      // 新用户自动加入 Default workspace
      const now = new Date().toISOString();
      const result = db
        .insert(users)
        .values({
          openId: `local-${Date.now()}`,
          name: input.name,
          email: input.email || null,
          passwordHash: hash,
          role: "user",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        })
        .run();
      const newUserId = Number(result.lastInsertRowid);
      // 创建专属 workspace (owner=该用户)
      const wsResult = db
        .insert(workspaces)
        .values({
          name: `${input.name}的工作区`,
          slug: `ws-${newUserId}-${Date.now()}`,
          createdBy: newUserId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const wsId = Number(wsResult.lastInsertRowid);
      db.insert(workspaceMembers)
        .values({
          workspaceId: wsId,
          userId: newUserId,
          role: "owner",
          joinedAt: now,
        })
        .run();
      // 注意: 注册成功后不 reset 限流计数 — register:ip 维度的成功窗口
      // 用于限制同一 IP 批量注册，reset 会使该保护失效
      return { userId: newUserId };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.ip || "0.0.0.0";
      // 双维度限流键：IP 维度 + 账号(email) 维度
      const ipKey = `login:ip:${ip}`;
      const acctKey = `login:acct:${input.email.toLowerCase()}`;
      // 只读预检: 不清零失败窗口（旧实现用 checkRateLimit(ip,false) 预检会清零失败计数，
      // 导致锁定预算被放大 3 倍——第 31 次才锁，而非设计的第 11 次）
      if (!(await peekRateLimit(ipKey)) || !(await peekRateLimit(acctKey)))
        throw new Error("登录尝试过于频繁，请 15 分钟后重试");
      // 失败计数: ip + email 双维度各自累计；任一维度超限即账号级/IP级锁定
      const recordLoginFailure = async () => {
        const [ipOk, acctOk] = await Promise.all([
          checkRateLimit(ipKey, true),
          checkRateLimit(acctKey, true),
        ]);
        if (!ipOk || !acctOk)
          throw new Error("登录尝试过于频繁，请 15 分钟后重试");
      };
      const result = db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1)
        .all();
      if (result.length === 0) {
        await recordLoginFailure();
        throw new Error("用户不存在或密码错误");
      }
      const user = result[0];
      if (!user.passwordHash) {
        await recordLoginFailure();
        throw new Error("该账号未设置密码，请使用本地模式");
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        await recordLoginFailure();
        throw new Error("用户不存在或密码错误");
      }
      await Promise.all([resetRateLimit(ipKey), resetRateLimit(acctKey)]);
      db.update(users)
        .set({ lastSignedIn: new Date().toISOString() })
        .where(eq(users.id, user.id))
        .run();

      // 获取用户的 workspace（取第一个加入的）
      const wsMember = db
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, user.id))
        .get();
      const token = signToken(user.id, user.tokenVersion ?? 0);
      // v1.1: login → session + audit event
      try {
        const { userSessions } = await import("../db/userSessions");
        const sessionId = crypto.randomUUID();
        const sessionIdHash = crypto
          .createHash("sha256")
          .update(sessionId)
          .digest("hex");
        db.insert(userSessions)
          .values({
            userId: user.id,
            sessionIdHash,
            ipAddress: ctx.ip || null,
            status: "ACTIVE" as any,
          } as any)
          .execute();
        const { ActivityTracker } = await import("../lib/activity-tracker");
        await ActivityTracker.track({
          userId: user.id,
          source: "USER",
          category: "AUTH",
          action: "LOGIN",
          level: "SECURITY",
          status: "SUCCESS",
          ipAddress: ctx.ip || undefined,
        });
      } catch {
        /* audit failure must not block login */
      }
      recordAudit({
        userId: user.id,
        workspaceId: wsMember?.workspaceId ?? 0,
        action: "login",
        entity: "auth",
        entityId: user.id,
      });
      // 设 httpOnly cookie（防 XSS 窃取 token）
      const res = ctx.res;
      if (res) {
        const isProd = process.env.NODE_ENV === "production";
        res.cookie("token", token, {
          httpOnly: true,
          secure: isProd,
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: "/",
        });
      }
      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const row = db
      .select({ notificationPrefs: users.notificationPrefs })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .get();
    let prefs: {
      notifications?: boolean;
      email?: boolean;
      reminders?: boolean;
    } | null = null;
    if (row?.notificationPrefs) {
      try {
        prefs = JSON.parse(row.notificationPrefs);
      } catch {
        prefs = null;
      }
    }
    return { ...ctx.user, notificationPrefs: prefs };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    // 清除 httpOnly cookie
    ctx.res.clearCookie?.("token", {
      httpOnly: true,
      secure: true,
      sameSite: "strict" as const,
      path: "/",
    });
    // 递增 tokenVersion 实现服务端强制登出
    try {
      const db = await import("../db");
      if (ctx.user?.id) {
        await db.incrementTokenVersion(ctx.user.id);
      }
    } catch (err) {
      console.error("[logout] tokenVersion increment failed:", err);
    }
    return { success: true };
  }),

  /** 生成 6 位机器人绑定验证码（5 分钟有效） */
  generateBotCode: protectedProcedure.mutation(({ ctx }) => {
    const code = generateAuthCode(ctx.user.id);
    return { code };
  }),

  /** 忘记密码 — 生成重置 token（24h 有效） */
  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.ip || "0.0.0.0";
      const rlKey = `forgot:ip:${ip}`;
      // 只读预检（不清零窗口计数）
      if (!(await peekRateLimit(rlKey)))
        throw new Error("操作过于频繁，请 15 分钟后重试");
      // 记录本次合法尝试（IP 维度成功窗口）
      await checkRateLimit(rlKey, false);
      const result = db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1)
        .all();
      if (result.length === 0) return { sent: true }; // 不暴露用户是否存在
      const user = result[0];
      const userEmail = user.email || "";
      // 邮件炸弹防护：按 email 维度限流（3 封/小时）；超限静默返回，
      // 不发送也不暴露限流细节（与"不暴露用户是否存在"策略一致）
      if (!checkEmailSendLimit(userEmail)) return { sent: true };
      // V35-14: 用随机 hex 码替代 JWT 放入 URL, 防止 token 信息泄露, TTL 缩短至 15min
      const resetToken = crypto.randomBytes(32).toString("hex");
      const { db: _db, eq: _eq } = await import("../db/connection");
      const { users: _users } = await import("../../drizzle/schema");
      const hash = bcrypt.hashSync(resetToken, config.auth.bcryptRounds);
      const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      _db
        .update(_users)
        .set({ resetTokenHash: hash, resetTokenExpiresAt: expires } as any)
        .where(_eq(_users.id, user.id))
        .execute();
      logger.info(
        { userId: user.id, action: "forgotPassword" },
        "password reset requested"
      );
      // 发送重置邮件（失败不影响主流程）
      import("../services/EmailService")
        .then(({ sendEmail }) => {
          const resetLink = `${process.env.APP_URL || "https://chronos.owain32380.cn"}/auth/reset-password?email=${encodeURIComponent(userEmail)}&code=${encodeURIComponent(resetToken)}`;
          sendEmail({
            to: userEmail,
            subject: "CHRONOS 密码重置",
            text: `你的密码重置码: ${resetToken}\n\n或点击链接: ${resetLink}\n\n15 分钟内有效。`,
          }).catch((err: unknown) =>
            console.error("[auth] sendEmail failed:", err)
          );
        })
        .catch((err: unknown) =>
          console.error("[auth] import EmailService failed:", err)
        );
      // 注意: 不 reset forgot:ip 计数 — 成功窗口用于限制同一 IP 的轰炸式请求
      return { sent: true };
    }),

  /** 重置密码 */
  resetPassword: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        token: z.string(),
        newPassword: z
          .string()
          .min(12, "密码至少 12 位")
          .regex(
            /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/,
            "密码需包含大写、小写、数字"
          ),
      })
    )
    .mutation(async ({ input }) => {
      const user = db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .get();
      if (!user?.resetTokenHash || !user?.resetTokenExpiresAt)
        throw new Error("无效的重置令牌");
      if (new Date(user.resetTokenExpiresAt) < new Date())
        throw new Error("重置令牌已过期");
      const valid = bcrypt.compareSync(input.token, user.resetTokenHash);
      if (!valid) throw new Error("无效的重置令牌");
      const newHash = bcrypt.hashSync(
        input.newPassword,
        config.auth.bcryptRounds
      );
      db.update(users)
        .set({
          passwordHash: newHash,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, user.id))
        .run();
      await incrementTokenVersion(user.id);
      logger.info(
        { userId: user.id, action: "resetPassword" },
        "password reset"
      );
      return { success: true };
    }),

  /** 应用内修改密码 */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1, "请输入当前密码"),
        newPassword: z
          .string()
          .min(12, "新密码至少12位")
          .regex(/[A-Z]/, "需包含大写字母")
          .regex(/[a-z]/, "需包含小写字母")
          .regex(/[0-9]/, "需包含数字"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .get();
      if (
        !user?.passwordHash ||
        !bcrypt.compareSync(input.currentPassword, user.passwordHash)
      ) {
        throw new Error("当前密码错误");
      }
      if (input.currentPassword === input.newPassword) {
        throw new Error("新密码不能与当前密码相同");
      }
      const hash = bcrypt.hashSync(input.newPassword, 12);
      db.update(users)
        .set({ passwordHash: hash })
        .where(eq(users.id, ctx.user.id))
        .run();
      await incrementTokenVersion(ctx.user.id);
      logger.info(
        { userId: ctx.user.id, action: "changePassword" },
        "password changed"
      );
      return { success: true };
    }),

  /** 删除账号 — 清空个人信息，保留业务数据（软删除） */
  deleteAccount: protectedProcedure
    .input(z.object({ password: z.string().min(1, "请输入当前密码确认") }))
    .mutation(async ({ input, ctx }) => {
      // V35-15: 删除账号前验证当前密码
      const user = db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .get();
      if (
        !user?.passwordHash ||
        !bcrypt.compareSync(input.password, user.passwordHash)
      ) {
        throw new Error("密码错误");
      }
      const now = new Date().toISOString();
      // 清空个人信息（GDPR 删除权）
      db.update(users)
        .set({
          name: "[deleted]",
          email: null,
          passwordHash: null,
          updatedAt: now,
        })
        .where(eq(users.id, ctx.user.id))
        .run();
      // v4.2: 删除时递增 tokenVersion 强制所有会话失效
      db.update(users)
        .set({ tokenVersion: sql`tokenVersion + 1` } as any)
        .where(eq(users.id, ctx.user.id))
        .run();
      // 审计记录
      try {
        const { recordAudit } = await import("../lib/audit");
        recordAudit({
          userId: ctx.user.id,
          action: "delete",
          entity: "users",
          entityId: ctx.user.id,
        });
      } catch {
        /* audit failure is non-blocking */
      }
      return { success: true };
    }),

  /** 搜索用户 (用于添加成员选择器, 仅搜索当前工作区内用户) */
  searchUsers: protectedProcedure
    .input(
      z.object({ query: z.string().min(1).max(100), workspaceId: z.number() })
    )
    .query(async ({ input, ctx }) => {
      // 防跨工作区 PII 枚举：调用者本人必须是目标工作区成员，
      // 否则任意登录用户可遍历他人工作区的姓名/邮箱
      const member = db
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, input.workspaceId),
            eq(workspaceMembers.userId, ctx.user.id)
          )
        )
        .get();
      if (!member) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "你不是该工作区成员",
        });
      }
      const { sqlite } = await import("../db/connection");
      // 仅返回当前 workspace 内的用户, 防止全平台 PII 枚举
      const users = sqlite
        .prepare(
          `SELECT u.id, u.name, u.email FROM users u
         INNER JOIN workspace_members wm ON wm.userId = u.id
         WHERE wm.workspaceId = ? AND (u.email LIKE ? OR u.name LIKE ?)
         LIMIT 20`
        )
        .all(input.workspaceId, `%${input.query}%`, `%${input.query}%`);
      return users;
    }),

  /** 导出个人数据 (GDPR 数据可携) */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    const { sqlite } = await import("../db/connection");
    const projects = sqlite
      .prepare(
        "SELECT p.id, p.name, p.description FROM projects p INNER JOIN projectMembers pm ON pm.projectId = p.id WHERE pm.userId = ? AND p.workspaceId = ?"
      )
      .all(ctx.user.id, ctx.workspaceId ?? 0);
    const tasks = sqlite
      .prepare(
        "SELECT t.id, t.title, t.status, t.priority, p.name as projectName FROM tasks t INNER JOIN projects p ON p.id = t.projectId INNER JOIN projectMembers pm ON pm.projectId = t.projectId WHERE pm.userId = ?"
      )
      .all(ctx.user.id);
    const closings = sqlite
      .prepare(
        "SELECT c.* FROM closings c INNER JOIN projects p ON p.id = c.projectId INNER JOIN projectMembers pm ON pm.projectId = p.id WHERE pm.userId = ? AND p.workspaceId = ?"
      )
      .all(ctx.user.id, ctx.workspaceId ?? 0);
    return {
      exportedAt: new Date().toISOString(),
      user: { name: ctx.user.name, email: ctx.user.email },
      workspaceId: ctx.workspaceId,
      projectCount: (projects as any[]).length,
      taskCount: (tasks as any[]).length,
      closingCount: (closings as any[]).length,
      projects,
      tasks,
      closings,
    };
  }),

  /** 邮箱验证 */
  verifyEmail: publicProcedure
    .input(z.object({ email: z.string().email(), token: z.string() }))
    .mutation(async ({ input }) => {
      const user = db
        .select({
          id: users.id,
          emailVerified: users.emailVerified,
          resetTokenHash: users.resetTokenHash,
          resetTokenExpiresAt: users.resetTokenExpiresAt,
        })
        .from(users)
        .where(eq(users.email, input.email))
        .get();
      if (!user) throw new Error("无效的验证链接");
      if (user.emailVerified) return { verified: true };
      if (
        !user.resetTokenHash ||
        !user.resetTokenExpiresAt ||
        new Date(user.resetTokenExpiresAt) < new Date()
      )
        throw new Error("验证令牌已过期");
      if (!bcrypt.compareSync(input.token, user.resetTokenHash))
        throw new Error("验证令牌无效");
      db.update(users)
        .set({
          emailVerified: 1,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        })
        .where(eq(users.id, user.id))
        .run();
      return { verified: true };
    }),

  /** 更新个人资料 (显示名/简介) */
  updateProfile: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(50),
        bio: z.string().max(200).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      db.update(users)
        .set({
          displayName: input.displayName,
          bio: input.bio || null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, ctx.user.id))
        .run();
      return { success: true };
    }),

  /** 上传头像 */
  uploadAvatar: protectedProcedure
    .input(z.object({ dataUrl: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      // 大小限制: dataUrl 整体 ≤ 3MB（base64 膨胀约 4/3，对应解码后 ≤ 2MB）
      if (input.dataUrl.length > 3 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "头像大小不能超过 2MB",
        });
      }
      // 仅接受 png/jpeg/webp 的 dataUrl（gif 等不再支持）
      const m =
        /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
          input.dataUrl
        );
      if (!m) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "仅支持 PNG/JPG/WebP 格式的图片",
        });
      }
      const buf = Buffer.from(m[2], "base64");
      if (buf.length === 0 || buf.length > 2 * 1024 * 1024) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "头像大小不能超过 2MB",
        });
      }
      // magic-byte 嗅探：不信任 dataUrl 声明的 MIME，校验真实文件头
      const isPng =
        buf.length >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47;
      const isJpg =
        buf.length >= 3 &&
        buf[0] === 0xff &&
        buf[1] === 0xd8 &&
        buf[2] === 0xff;
      const isWebp =
        buf.length >= 12 &&
        buf.toString("ascii", 0, 4) === "RIFF" &&
        buf.toString("ascii", 8, 12) === "WEBP";
      if (!isPng && !isJpg && !isWebp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文件内容不是有效的 PNG/JPG/WebP 图片",
        });
      }
      const ext = isPng ? "png" : isJpg ? "jpg" : "webp";
      // 随机文件名：不可预测，避免覆盖他人文件/被猜测直链
      const filename = `${ctx.user.id}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
      const fs = await import("fs");
      const path = await import("path");
      const dir = path.join(process.cwd(), "public", "uploads", "avatars");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), buf);
      const avatarUrl = `/uploads/avatars/${filename}?v=${Date.now()}`;
      db.update(users)
        .set({ avatarUrl })
        .where(eq(users.id, ctx.user.id))
        .run();
      return { avatarUrl };
    }),

  /** 更新通知偏好 */
  updateNotificationPrefs: protectedProcedure
    .input(
      z.object({
        notifications: z.boolean(),
        email: z.boolean(),
        reminders: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { sqlite } = await import("../db/connection");
      sqlite
        .prepare("UPDATE users SET notificationPrefs = ? WHERE id = ?")
        .run(JSON.stringify(input), ctx.user.id);
      return { success: true };
    }),
});
