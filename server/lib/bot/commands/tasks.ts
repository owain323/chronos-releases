import * as db from "../../../db";
import { contextHeader, footer, priEmoji, dueHint } from "./_utils";

export async function handleTasks(
  projectId: number,
  userId: number,
  showAll: boolean
): Promise<string> {
  const columns = await db.getKanbanColumnsByProjectId(projectId);
  const completedNames = new Set([
    "已完成",
    "完成",
    "done",
    "completed",
    "closed",
  ]);
  const activeColumns = showAll
    ? columns
    : columns.filter(c => !completedNames.has(c.name.toLowerCase()));

  const ctx = await contextHeader(projectId, userId);
  if (!activeColumns.length) {
    return `${ctx}\n\n📋 还没有任务。\n\n输入 /创建 <标题> 来添加第一个任务！`;
  }

  const lines: string[] = [
    `${ctx}\n`,
    `📋 ${showAll ? "全部任务" : "待办任务"}\n`,
  ];
  let count = 0;

  for (const col of activeColumns) {
    const colTasks = await db.getTasksByColumnId(col.id);
    if (colTasks.length === 0) continue;
    lines.push(`▸ **${col.name}** (${colTasks.length})`);

    for (const task of colTasks.slice(0, 5)) {
      count++;
      const dueLabel = dueHint(task.dueDate);
      lines.push(
        `  #${task.id} ${priEmoji(task.priority)} ${task.title}${dueLabel}`
      );
    }
    if (colTasks.length > 5) lines.push(`  ...还有 ${colTasks.length - 5} 个`);
  }

  if (count === 0) return `${ctx}\n\n📋 目前没有任务。/创建 <标题> 新建一个！`;
  lines.push(
    footer(["/创建 <标题>", "/完成 #编号", "/搜索 <关键词>", "/报表"])
  );
  return lines.join("\n");
}
