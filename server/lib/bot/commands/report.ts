import * as db from "../../../db";
import { contextHeader, footer } from "./_utils";

export async function handleReport(
  projectId: number,
  userId: number,
  appUrl: string
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const project = await db.getProjectById(projectId);
  const tasks = await db.getTasksByProjectId(projectId);
  const costs = await db.getCostEntriesByProjectId(projectId);
  const columns = await db.getKanbanColumnsByProjectId(projectId);

  const totalCost = costs.reduce((s, c) => s + c.amount, 0);
  const doneCols = columns.filter(c =>
    ["已完成", "完成", "done", "completed"].includes(c.name.toLowerCase())
  );
  const doneTaskIds = new Set<number>();
  for (const col of doneCols) {
    const colTasks = await db.getTasksByColumnId(col.id);
    colTasks.forEach(t => doneTaskIds.add(t.id));
  }
  const completedCount = doneTaskIds.size;
  const overdue = tasks.filter(
    t => t.dueDate && new Date(t.dueDate) < new Date()
  );

  const lines: string[] = [
    ctx,
    "",
    `📊 **${project?.name || "项目"} 报表**\n`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📝 任务：${tasks.length}（完成 ${completedCount} · 进行中 ${tasks.length - completedCount} · 逾期 ${overdue.length}）`,
    `💰 成本：¥${totalCost.toFixed(2)}（${costs.length} 笔）`,
  ];

  if (overdue.length > 0) {
    lines.push(`\n⚠️ 逾期任务：`);
    overdue.slice(0, 5).forEach(t => lines.push(`  #${t.id} ${t.title}`));
  }
  if (costs.length > 0) {
    lines.push(`\n最近成本：`);
    costs
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 3)
      .forEach(c => lines.push(`  ${c.name}: ¥${c.amount.toFixed(2)}`));
  }

  if (appUrl)
    lines.push(`\n📎 完整报表：${appUrl}/projects/${projectId}/costs`);
  lines.push(footer(["/任务", "/成本 统计", "/今日"]));
  return lines.join("\n");
}
