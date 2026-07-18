import * as db from "../../../db";

export async function handleDelete(
  taskId: number,
  projectId: number
): Promise<string> {
  const task = await db.getTaskById(taskId);
  if (!task) return `❌ 找不到任务 #${taskId}`;
  if (task.projectId !== projectId) return `❌ 任务 #${taskId} 不属于当前项目`;

  const title = task.title;
  await db.deleteTask(taskId);
  return `🗑 #${taskId}「${title}」已删除。\n\n⚠️ 此操作不可撤销。`;
}
