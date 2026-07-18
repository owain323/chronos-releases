import { db } from "../db/connection";
import { auditLogs } from "../../drizzle/schema";

// v3.6 FIX (T2): 同步写库 — 内存队列在进程崩溃时丢审计, 对财务合规 0 容忍
// 改用每条 recordAudit 立即 db.insert 同步写, 去掉 setImmediate 队列

export function recordAudit(opts: {
  userId: number;
  action: "create" | "update" | "delete" | string;
  entity: string;
  entityId: number;
  projectId?: number;
  workspaceId?: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}) {
  const changes =
    opts.before || opts.after
      ? JSON.stringify({
          before: opts.before ?? null,
          after: opts.after ?? null,
        })
      : null;

  try {
    db.insert(auditLogs)
      .values({
        workspaceId: opts.workspaceId ?? 0,
        projectId: opts.projectId ?? null,
        userId: opts.userId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        changes,
        ip: opts.ip ?? null,
        createdAt: new Date().toISOString(),
      })
      .run();
  } catch (err) {
    // 审计写入失败不阻塞业务, 但会记录到 stderr (运维可监控)
    console.error("[audit] sync write failed:", err);
  }
}
