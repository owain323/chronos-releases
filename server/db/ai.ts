/**
 * Phase 8 Step 2 · ai_runs 表 CRUD
 */
import { db, eq, and } from "./connection";
import { aiRuns } from "../../drizzle/schema";
import type { AIRunStatus, Plan } from "../services/ai/types";

/** 创建 AI Run (状态: planning) */
export function createAIRun(
  userId: number,
  workspaceId: number,
  plan: Plan,
  idempotencyKey: string,
  projectId?: number
) {
  return db
    .insert(aiRuns)
    .values({
      userId,
      workspaceId,
      projectId: projectId ?? null,
      plan: JSON.stringify(plan),
      idempotencyKey,
      status: "planning",
      createdVia: "AI",
      promptVersion: `v${plan.schema_version || 1}`,
      schemaVersion: plan.schema_version || 1,
    })
    .run();
}

/** 更新 Run 状态 */
export function updateAIRunStatus(runId: number, status: AIRunStatus) {
  return db
    .update(aiRuns)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(aiRuns.id, runId))
    .run();
}

/** 获取 Run */
export function getAIRun(runId: number) {
  return db.select().from(aiRuns).where(eq(aiRuns.id, runId)).get();
}

/** 获取用户当前 pending/executing 的 Run */
export function getPendingRun(userId: number) {
  return (
    db
      .select()
      .from(aiRuns)
      .where(
        and(eq(aiRuns.userId, userId), eq(aiRuns.status, "pending" as any))
      )
      .get() ||
    db
      .select()
      .from(aiRuns)
      .where(
        and(eq(aiRuns.userId, userId), eq(aiRuns.status, "executing" as any))
      )
      .get()
  );
}

/** 幂等检查 — 查找相同 idempotency_key 的 Run */
export function getIdempotentRun(key: string) {
  return db.select().from(aiRuns).where(eq(aiRuns.idempotencyKey, key)).get();
}

/** 获取 Run 列表 (按用户) */
export function getRunsByUser(userId: number, limit: number = 20) {
  return db
    .select()
    .from(aiRuns)
    .where(eq(aiRuns.userId, userId))
    .orderBy(aiRuns.createdAt)
    .limit(limit)
    .all()
    .reverse()
    .slice(0, limit);
}
