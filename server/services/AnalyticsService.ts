/**
 * AnalyticsService — 项目分析业务逻辑
 */
import * as db from "../db";
import { getCached } from "../lib/cache";

export async function getProjectStats(projectId: number) {
  const project = await db.getProjectById(projectId);
  if (!project)
    return {
      totalTasks: 0,
      completedTasks: 0,
      completionRate: 0,
      tasksByPriority: {},
    };

  const columns = await db.getKanbanColumnsByProjectId(projectId);
  const completedColumnIds = columns
    .filter(c => c.name === "已完成")
    .map(c => c.id);
  const allTasks = await db.getTasksByProjectId(projectId);

  const tasksByColumn = new Map<number, typeof allTasks>();
  for (const t of allTasks) {
    const bucket = tasksByColumn.get(t.columnId) || [];
    bucket.push(t);
    tasksByColumn.set(t.columnId, bucket);
  }

  let completedTasks = 0;
  const tasksByPriority: Record<string, number> = {};
  for (const col of columns) {
    const colTasks = tasksByColumn.get(col.id) || [];
    if (completedColumnIds.includes(col.id)) completedTasks += colTasks.length;
    for (const t of colTasks) {
      const p = t.priority || "medium";
      tasksByPriority[p] = (tasksByPriority[p] || 0) + 1;
    }
  }

  return getCached(`stats:${projectId}`, () => ({
    totalTasks: allTasks.length,
    completedTasks,
    completionRate:
      allTasks.length > 0
        ? Math.round((completedTasks / allTasks.length) * 100)
        : 0,
    tasksByPriority,
  }));
}

export async function getCostSummary(projectId: number) {
  if (process.env.USE_SQL_AGGREGATION === "true") {
    const { db } = await import("../db/connection");
    const { eq, sql } = await import("drizzle-orm");
    const { costEntries } = await import("../../drizzle/schema");
    const total = db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(costEntries)
      .where(eq(costEntries.projectId, projectId))
      .get() as { total: number };
    const byCat = db
      .select({
        category: costEntries.category,
        total: sql<number>`SUM(amount)`,
      })
      .from(costEntries)
      .where(eq(costEntries.projectId, projectId))
      .groupBy(costEntries.category)
      .all() as { category: string; total: number }[];
    const byCategory: Record<string, number> = {};
    byCat.forEach(r => {
      byCategory[r.category] = r.total;
    });
    return { total: total?.total ?? 0, count: byCat.length, byCategory };
  }
  const costs = await db.getCostEntriesByProjectId(projectId);
  const total = costs.reduce((sum, c) => sum + c.amount, 0);
  const byCategory: Record<string, number> = {};
  costs.forEach(c => {
    byCategory[c.category] = (byCategory[c.category] || 0) + c.amount;
  });
  return { total, count: costs.length, byCategory };
}
