import { db, eq } from "./connection";
import { sql } from "drizzle-orm";
import { users, type InsertUser } from "../../drizzle/schema";

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  try {
    const existing = db
      .select()
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1)
      .all();
    if (existing.length > 0) {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      };
      if (user.name !== undefined) updateData.name = user.name;
      if (user.email !== undefined) updateData.email = user.email;
      if (user.loginMethod !== undefined)
        updateData.loginMethod = user.loginMethod;
      if (user.lastSignedIn !== undefined)
        updateData.lastSignedIn = user.lastSignedIn;
      if (user.role !== undefined) updateData.role = user.role;
      db.update(users)
        .set(updateData)
        .where(eq(users.openId, user.openId))
        .run();
    } else {
      const now = new Date().toISOString();
      db.insert(users)
        .values({
          openId: user.openId,
          name: user.name ?? null,
          email: user.email ?? null,
          loginMethod: user.loginMethod ?? null,
          role: user.role ?? "user",
          lastSignedIn: user.lastSignedIn ?? now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const result = db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const result = db.select().from(users).where(eq(users.id, id)).limit(1).all();
  return result.length > 0 ? result[0] : undefined;
}

/** 按邮箱查找 */
export async function getUserByEmail(email: string) {
  const result = db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}

/** 按用户名查找（机器人注册/登录用） */
export async function getUserByName(name: string) {
  const result = db
    .select()
    .from(users)
    .where(eq(users.name, name))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}

/** 创建带密码的正式用户 */
export async function createUserWithPassword(
  name: string,
  passwordHash: string
): Promise<number> {
  const now = new Date().toISOString();
  const openId = `bot:${name}:${Date.now()}`;
  const result = db
    .insert(users)
    .values({
      openId,
      name,
      passwordHash,
      role: "user",
      loginMethod: "bot",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export async function updateUserLastSignIn(id: number): Promise<void> {
  db.update(users)
    .set({ lastSignedIn: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
}

/** 递增 tokenVersion — 使所有现有 JWT 失效 (logout / 安全事件) · 原子操作 */
export function incrementTokenVersion(id: number) {
  return db
    .update(users)
    .set({ tokenVersion: sql`tokenVersion + 1` } as any)
    .where(eq(users.id, id))
    .run();
}
