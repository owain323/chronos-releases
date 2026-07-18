/**
 * 通知服务 — 写入 + 查询 + 标记已读 + 外部广播
 * 使用 Drizzle ORM（与项目其他数据层一致）
 */
import { logger } from "./logger";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import {
  notifications,
  projects,
  type InsertNotification,
} from "../../drizzle/schema";
import { db } from "../db/connection";

export { type InsertNotification };

export function createNotification(data: InsertNotification) {
  return db
    .insert(notifications)
    .values({ ...data, read: false, createdAt: new Date().toISOString() })
    .run();
}

export function getNotifications(projectId: number, limit: number = 50) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.projectId, projectId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all();
}

export async function getNotificationById(id: number) {
  const { db, eq } = await import("../db/connection");
  const { notifications } = await import("../../drizzle/schema");
  return db.select().from(notifications).where(eq(notifications.id, id)).get();
}

export function getUnreadCount(projectId: number) {
  const result = db
    .select({ count: sql`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.projectId, projectId), eq(notifications.read, false))
    )
    .get();
  return (result?.count as number) ?? 0;
}

export function markRead(id: number) {
  return db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, id))
    .run();
}

export function markAllRead(projectId: number) {
  return db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.projectId, projectId))
    .run();
}

/** 该 workspace 下全部项目 id（workspace 维度通知聚合的基础） */
function getWorkspaceProjectIds(workspaceId: number): number[] {
  return db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .all()
    .map(p => p.id);
}

/** workspace 维度：聚合该工作区下所有项目的通知 */
export function getWorkspaceNotifications(
  workspaceId: number,
  limit: number = 50
) {
  const projectIds = getWorkspaceProjectIds(workspaceId);
  if (projectIds.length === 0) return [];
  return db
    .select()
    .from(notifications)
    .where(inArray(notifications.projectId, projectIds))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all();
}

/** workspace 维度：该工作区下所有项目的未读通知数 */
export function getWorkspaceUnreadCount(workspaceId: number) {
  const projectIds = getWorkspaceProjectIds(workspaceId);
  if (projectIds.length === 0) return 0;
  const result = db
    .select({ count: sql`count(*)` })
    .from(notifications)
    .where(
      and(
        inArray(notifications.projectId, projectIds),
        eq(notifications.read, false)
      )
    )
    .get();
  return (result?.count as number) ?? 0;
}

/** workspace 维度：将该工作区下所有项目的通知标记为已读 */
export function markAllWorkspaceRead(workspaceId: number) {
  const projectIds = getWorkspaceProjectIds(workspaceId);
  if (projectIds.length === 0) return { changes: 0 };
  return db
    .update(notifications)
    .set({ read: true })
    .where(inArray(notifications.projectId, projectIds))
    .run();
}

export function notify(
  projectId: number,
  userId: number,
  type: string,
  title: string,
  body?: string,
  link?: string
) {
  try {
    createNotification({ projectId, userId, type, title, body, link });
  } catch (e) {
    logger.error({ ctx: "notify" }, "[Notify] write error:", e);
  }
}

/** 异步通知（写入站内 + webhook 广播） — 不阻塞 */
export async function notifyAsync(
  projectId: number,
  event: string,
  ctx: Record<string, string>
): Promise<void> {
  try {
    const { db } = await import("../db/connection");
    const { webhooks } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const whs = db
      .select()
      .from(webhooks)
      .where(eq(webhooks.projectId, projectId))
      .all();
    if (whs.length > 0) await broadcastToProject(whs, event, ctx);
  } catch (e) {
    logger.error({ ctx: "notify" }, "[Notify] async error:", e);
  }
}

// 带重试的 webhook 发送（最多 3 次，指数退避 1s/2s/4s）
async function sendWithRetry(
  url: string,
  body: string,
  retries = 3
): Promise<boolean> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (res.ok) return true;
    } catch (err) {
      logger.error(
        { ctx: "notify" },
        `[webhook] attempt ${i + 1} failed:`,
        err
      );
    }
    if (i < retries)
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
  }
  return false;
}

export async function broadcastToProject(
  webhooks: any[],
  event: string,
  ctx: Record<string, string>
): Promise<void> {
  const text =
    (
      {
        task_created: `📋 新任务：${ctx.taskTitle || "未命名"} | 项目：${ctx.projectName}`,
        task_completed: `✅ 任务完成：${ctx.taskTitle || ""} | 项目：${ctx.projectName}`,
        cost_added: `💰 新成本：¥${ctx.amount} ${ctx.costName} | 项目：${ctx.projectName}`,
      } as Record<string, string>
    )[event] || `${event}`;

  const body = JSON.stringify({ msgtype: "text", text: { content: text } });
  for (const wh of webhooks) {
    if (
      typeof wh.webhookUrl !== "string" ||
      !wh.webhookUrl.startsWith("https://")
    )
      continue;
    // v4.1: SSRF guard — 拒绝内网/元数据地址
    try {
      const u = new URL(wh.webhookUrl);
      // v3.5: SSRF — 阻止所有私网/环回/链路本地/元数据/云元数据
      const blocked =
        /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|localhost$|metadata\.google\.internal$|::1$|0:0:0:0:0:0:0:1$)/i;
      const hexOctalInt = /^(0x[0-9a-f]+|0[0-7]+|0o[0-7]+|\d{10})$/i;
      // WHATWG URL 会保留 IPv6 hostname 的方括号（"[::1]"），并把
      // IPv6-mapped IPv4 归一化为 hex 形式（"[::ffff:7f00:1]"）。
      // 匹配前先剥离方括号，再把 mapped IPv4 还原为点分十进制。
      let host = u.hostname.replace(/^\[|\]$/g, "");
      const mapped = /^::ffff:(.+)$/i.exec(host);
      if (mapped) {
        const tail = mapped[1];
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(tail)) {
          host = tail; // 点分十进制形式 ::ffff:127.0.0.1
        } else if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(tail)) {
          // WHATWG 归一化的 hex 形式 ::ffff:7f00:1 → 127.0.0.1
          const [hi, lo] = tail.split(":").map(h => parseInt(h, 16));
          host = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
        }
      }
      if (blocked.test(host) || hexOctalInt.test(host)) continue;
    } catch {
      continue;
    }
    const ok = await sendWithRetry(wh.webhookUrl, body);
    if (!ok)
      logger.error(
        { ctx: "notify" },
        `[Broadcast] Webhook ${wh.id} failed after retries`
      );
  }
}
