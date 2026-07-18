import * as db from "../../../db";
import { contextHeader, footer } from "./_utils";

export async function handleComplete(
  taskId: number,
  projectId: number,
  userId: number
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const task = await db.getTaskById(taskId);
  if (!task) {
    const allTasks = await db.getTasksByProjectId(projectId);
    if (!allTasks.length) return `${ctx}\n\n❌ 找不到任务 #${taskId}。`;
    const ids = allTasks
      .slice(0, 10)
      .map(t => `#${t.id}`)
      .join(", ");
    return `${ctx}\n\n❌ 找不到任务 #${taskId}。\n\n可用编号：${ids}`;
  }
  if (task.projectId !== projectId)
    return `${ctx}\n\n❌ 任务 #${taskId} 不属于当前项目。`;

  const columns = await db.getKanbanColumnsByProjectId(projectId);
  const doneCol =
    columns.find(c =>
      ["已完成", "完成", "done", "completed"].includes(c.name.toLowerCase())
    ) || columns[columns.length - 1];

  await db.updateTaskColumn(taskId, doneCol.id, 0);

  // 统计剩余活跃任务
  const activeColumns = columns.filter(
    c => !["已完成", "完成", "done", "completed"].includes(c.name.toLowerCase())
  );
  let remaining = 0;
  for (const col of activeColumns) {
    const colTasks = await db.getTasksByColumnId(col.id);
    remaining += colTasks.length;
  }

  return [
    ctx,
    "",
    `✅ #${taskId}「${task.title}」已完成！🎉`,
    remaining > 0 ? `📋 还有 ${remaining} 个待办任务` : "🎯 所有任务都完成了！",
    footer(["/任务", "/创建 <标题>", "/今日"]),
  ].join("\n");
}
