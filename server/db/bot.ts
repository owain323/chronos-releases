/**
 * Bot 多用户上下文 + 验证码管理
 * 200-300 人规模，SQLite 完全够用。
 * 每人一行 context 记录当前项目、临时缓存。
 */
import { db, eq, and } from "./connection";
import { botUserContext, botAuthCodes, users } from "../../drizzle/schema";
import { upsertUser } from "./users";

// ============================================================
// 上下文管理
// ============================================================

export interface BotContext {
  chronosUserId: number;
  currentProjectId: number;
  lastCommand: string | null;
  tempData: Record<string, unknown>;
  isNew: boolean;
}

/** 查或建用户上下文。第一次来的用户自动创建 CHRONOS 账号。 */
export function getOrCreateBotUser(
  platform: string,
  platformUserId: string
): BotContext {
  const existing = db
    .select()
    .from(botUserContext)
    .where(
      and(
        eq(botUserContext.platform, platform),
        eq(botUserContext.platformUserId, platformUserId)
      )
    )
    .limit(1)
    .all();

  if (existing.length > 0) {
    const row = existing[0];
    db.update(botUserContext)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(botUserContext.id, row.id))
      .run();
    return {
      chronosUserId: row.chronosUserId,
      currentProjectId: row.currentProjectId,
      lastCommand: row.lastCommand,
      tempData: parseTempData(row.tempData),
      isNew: false,
    };
  }

  // 新建用户
  const openId = `${platform}:${platformUserId}`;
  upsertUser({
    openId,
    name: platformUserId,
    loginMethod: platform,
    role: "user",
    lastSignedIn: new Date().toISOString(),
  });

  const dbUser = db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1)
    .all();
  const chronosUserId = dbUser[0]?.id || 1;
  const now = new Date().toISOString();

  db.insert(botUserContext)
    .values({
      platform,
      platformUserId,
      chronosUserId,
      currentProjectId: 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    chronosUserId,
    currentProjectId: 1,
    lastCommand: null,
    tempData: {},
    isNew: true,
  };
}

/** 更新上下文（切换项目、缓存搜索、上次命令等） */
export function updateBotContext(
  platform: string,
  platformUserId: string,
  updates: {
    currentProjectId?: number;
    lastCommand?: string;
    tempData?: Record<string, unknown>;
  }
): void {
  db.update(botUserContext)
    .set({
      ...(updates.currentProjectId !== undefined
        ? { currentProjectId: updates.currentProjectId }
        : {}),
      ...(updates.lastCommand !== undefined
        ? { lastCommand: updates.lastCommand }
        : {}),
      ...(updates.tempData !== undefined
        ? { tempData: JSON.stringify(updates.tempData) }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(botUserContext.platform, platform),
        eq(botUserContext.platformUserId, platformUserId)
      )
    )
    .run();
}

/** 绑定企微用户到已有 CHRONOS 账号（!login 用） */
export function bindBotUser(
  platform: string,
  platformUserId: string,
  chronosUserId: number
): void {
  const existing = db
    .select()
    .from(botUserContext)
    .where(
      and(
        eq(botUserContext.platform, platform),
        eq(botUserContext.platformUserId, platformUserId)
      )
    )
    .limit(1)
    .all();
  const now = new Date().toISOString();

  if (existing.length > 0) {
    db.update(botUserContext)
      .set({ chronosUserId, updatedAt: now })
      .where(eq(botUserContext.id, existing[0].id))
      .run();
  } else {
    db.insert(botUserContext)
      .values({
        platform,
        platformUserId,
        chronosUserId,
        currentProjectId: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
}

// ============================================================
// 验证码
// ============================================================

/** 生成 6 位一次性验证码，5 分钟有效 */
export function generateAuthCode(chronosUserId: number): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.insert(botAuthCodes).values({ code, chronosUserId, expiresAt }).run();
  return code;
}

/** 兑现验证码。成功返回 chronosUserId，失败返回 null */
export function redeemAuthCode(code: string): number | null {
  const rows = db
    .select()
    .from(botAuthCodes)
    .where(eq(botAuthCodes.code, code))
    .limit(1)
    .all();

  if (rows.length === 0) return null;

  const row = rows[0];
  if (new Date(row.expiresAt) < new Date()) {
    db.delete(botAuthCodes).where(eq(botAuthCodes.code, code)).run();
    return null;
  }

  const userId = row.chronosUserId;
  db.delete(botAuthCodes).where(eq(botAuthCodes.code, code)).run();
  return userId;
}

// ============================================================
// 辅助
// ============================================================

function parseTempData(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e: unknown) {
    console.warn(
      "[Bot] tempData parse failed:",
      e instanceof Error ? e.message : String(e)
    );
    return {};
  }
}
