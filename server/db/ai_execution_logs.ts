/**
 * Phase 8 Step 4 · ai_execution_logs CRUD
 */
import { db, eq } from "./connection";
import { aiExecutionLogs, aiRuns } from "../../drizzle/schema";

export function recordAIExecutionLog(data: {
  runId: number;
  model: string;
  promptVersion?: string;
  schemaVersion?: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  status: string;
  error?: string | null;
  durationMs: number;
}) {
  return db
    .insert(aiExecutionLogs)
    .values({
      runId: data.runId,
      model: data.model,
      promptVersion: data.promptVersion || "v1",
      schemaVersion: data.schemaVersion || 1,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      cost: data.cost,
      status: data.status,
      error: data.error ?? null,
      durationMs: data.durationMs,
    })
    .run();
}

export function getExecutionLogsByRunId(runId: number) {
  return db
    .select()
    .from(aiExecutionLogs)
    .where(eq(aiExecutionLogs.runId, runId))
    .all();
}

/** 总成本统计 */
export function getAICostStats(userId: number) {
  const rows = db
    .select({ cost: aiExecutionLogs.cost })
    .from(aiExecutionLogs)
    .innerJoin(aiRuns, eq(aiExecutionLogs.runId, aiRuns.id))
    .where(eq(aiRuns.userId, userId))
    .all();
  const total = rows.reduce((sum, r) => sum + (r.cost || 0), 0);
  return {
    totalCost: Math.round(total * 10000) / 10000,
    totalCalls: rows.length,
  };
}
