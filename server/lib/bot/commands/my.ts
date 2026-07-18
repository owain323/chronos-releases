import * as db from "../../../db";
import { contextHeader, footer, priEmoji, dueHint } from "./_utils";

export async function handleMy(
  projectId: number,
  userId: number
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const allTasks = await db.getTasksByProjectId(projectId);
  const columns = await db.getKanbanColumnsByProjectId(projectId);

  // 过滤：只显示我负责的活跃任务
  const completedNames = new Set([
    "已完成",
    "完成",
    "done",
    "completed",
    "closed",
  ]);
  const doneColIds = new Set(
    columns.filter(c => completedNames.has(c.name.toLowerCase())).map(c => c.id)
  );
  const myTasks = allTasks.filter(
    t => t.assigneeId === userId && !doneColIds.has(t.columnId)
  );

  if (!myTasks.length)
    return `${ctx}\n\n📋 你没有待办任务。\n\n/创建 <标题> 新建一个！`;

  const colMap = new Map(columns.map(c => [c.id, c.name]));
  const lines: string[] = [ctx, "", `📋 你的任务 (${myTasks.length})：\n`];

  myTasks.slice(0, 10).forEach(t => {
    const colName = colMap.get(t.columnId) || "其他";
    const dueLabel = dueHint(t.dueDate);
    lines.push(
      `  #${t.id} ${priEmoji(t.priority)} ${t.title}${dueLabel} [${colName}]`
    );
  });

  if (myTasks.length > 10) lines.push(`  ...还有 ${myTasks.length - 10} 个`);
  lines.push(footer(["/完成 #编号", "/更新 #编号 <标题>", "/搜索 <关键词>"]));
  return lines.join("\n");
}
