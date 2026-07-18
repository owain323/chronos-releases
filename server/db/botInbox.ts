// server/db/botInbox.ts — bot 文件收件箱 CRUD (v4.0)
import { eq, and, lt } from "drizzle-orm";
import { db } from "./connection";
import { botInbox, type InsertBotInboxItem } from "../../drizzle/schema";
import fs from "fs";

const INBOX_DIR = "data/bot-inbox";

export function insertInboxItem(item: InsertBotInboxItem) {
  return db.insert(botInbox).values(item).run();
}

export function listPendingInbox(botUserId: string) {
  // Ensure inbox directory exists
  if (!fs.existsSync(INBOX_DIR)) fs.mkdirSync(INBOX_DIR, { recursive: true });
  return db
    .select()
    .from(botInbox)
    .where(
      and(eq(botInbox.botUserId, botUserId), eq(botInbox.status, "pending"))
    )
    .all();
}

export function markInboxCommitted(id: number) {
  return db
    .update(botInbox)
    .set({
      status: "committed",
      committedAt: Date.now(),
    })
    .where(eq(botInbox.id, id))
    .run();
}

export function discardInbox(botUserId: string) {
  const items = listPendingInbox(botUserId);
  for (const item of items) {
    try {
      if (item.tempPath && fs.existsSync(item.tempPath))
        fs.unlinkSync(item.tempPath);
    } catch {
      /* ignore */
    }
  }
  return db
    .update(botInbox)
    .set({ status: "discarded" })
    .where(
      and(eq(botInbox.botUserId, botUserId), eq(botInbox.status, "pending"))
    )
    .run();
}

export function sweepExpiredInbox(): number {
  const now = Date.now();
  const expired = db
    .select()
    .from(botInbox)
    .where(and(lt(botInbox.expiresAt, now), eq(botInbox.status, "pending")))
    .all();
  let cleaned = 0;
  for (const item of expired) {
    try {
      if (item.tempPath && fs.existsSync(item.tempPath))
        fs.unlinkSync(item.tempPath);
    } catch {
      /* ignore */
    }
    db.update(botInbox)
      .set({ status: "expired" })
      .where(eq(botInbox.id, item.id))
      .run();
    cleaned++;
  }
  return cleaned;
}

export function countPending(botUserId: string): number {
  const rows = db
    .select()
    .from(botInbox)
    .where(
      and(eq(botInbox.botUserId, botUserId), eq(botInbox.status, "pending"))
    )
    .all();
  return rows.length;
}
