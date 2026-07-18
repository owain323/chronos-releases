import * as db from "../../../db";
import { contextHeader, footer } from "./_utils";

export async function handleToday(
  projectId: number,
  userId: number
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const columns = await db.getKanbanColumnsByProjectId(projectId);
  const completedNames = new Set([
    "已完成",
    "完成",
    "done",
    "completed",
    "closed",
  ]);
  const activeCols = columns.filter(
    c => !completedNames.has(c.name.toLowerCase())
  );

  const dueTasks: {
    id: number;
    title: string;
    columnName: string;
    daysLeft: number;
  }[] = [];
  for (const col of activeCols) {
    const colTasks = await db.getTasksByColumnId(col.id);
    for (const task of colTasks) {
      if (!task.dueDate) continue;
      const daysLeft = Math.ceil(
        (new Date(task.dueDate).getTime() - Date.now()) / 86400000
      );
      if (daysLeft <= 1)
        dueTasks.push({
          id: task.id,
          title: task.title,
          columnName: col.name,
          daysLeft,
        });
    }
  }

  if (!dueTasks.length) return `${ctx}\n\n✅ 今天没有到期的任务！`;

  const overdue = dueTasks.filter(t => t.daysLeft < 0);
  const todayOnes = dueTasks.filter(t => t.daysLeft === 0);
  const tmrOnes = dueTasks.filter(t => t.daysLeft === 1);

  const lines: string[] = [ctx, "", "⏰ **今日关注**\n"];
  if (overdue.length) {
    lines.push(`🔴 已超期 (${overdue.length})：`);
    overdue.forEach(t => lines.push(`  #${t.id} ${t.title} [${t.columnName}]`));
    lines.push("");
  }
  if (todayOnes.length) {
    lines.push(`⚠️ 今天到期 (${todayOnes.length})：`);
    todayOnes.forEach(t =>
      lines.push(`  #${t.id} ${t.title} [${t.columnName}]`)
    );
    lines.push("");
  }
  if (tmrOnes.length) {
    lines.push(`📅 明天到期 (${tmrOnes.length})：`);
    tmrOnes.forEach(t => lines.push(`  #${t.id} ${t.title} [${t.columnName}]`));
  }

  lines.push(footer(["/完成 #编号", "/任务"]));
  return lines.join("\n");
}
