import * as db from "../../../db";

/**
 * 批量导入命令
 * 支持格式: 每行一条，逗号分隔
 *   任务,标题,优先级
 *   成本,金额,名称
 *
 * 例：
 *   !导入
 *   任务,修登录Bug,high
 *   任务,写文档,medium
 *   成本,500,买茶叶
 */
export async function handleImport(
  projectId: number,
  userId: number,
  args: string
): Promise<string> {
  if (!args || args.length < 3) {
    return "❌ 请提供导入数据。\n\n用法：\n!导入\n任务,修Bug,high\n成本,500,买茶叶\n\n每行一条，逗号分隔。";
  }

  const lines = args
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);
  let taskCount = 0;
  let costCount = 0;

  const columns = await db.getKanbanColumnsByProjectId(projectId);
  if (!columns.length) {
    await db.createKanbanColumn({ projectId, name: "待办", order: 0 });
    await db.createKanbanColumn({ projectId, name: "进行中", order: 1 });
    await db.createKanbanColumn({ projectId, name: "已完成", order: 2 });
  }

  const cols = await db.getKanbanColumnsByProjectId(projectId);
  const todoCol = cols.find(c => c.name === "待办") || cols[0];

  for (const line of lines) {
    try {
      const parts = line.split(",").map(p => p.trim());
      if (parts[0] === "任务" || parts[0] === "task") {
        const title = parts[1];
        const priority = (parts[2] || "medium") as string;
        if (!title) continue;
        const existing = await db.getTasksByColumnId(todoCol.id);
        await db.createTask({
          projectId,
          columnId: todoCol.id,
          title,
          creatorId: userId,
          order: existing.length + taskCount,
          priority: priority as "high" | "medium" | "low",
        });
        taskCount++;
      } else if (parts[0] === "成本" || parts[0] === "cost") {
        const amount = parts[1];
        const name = parts[2] || "未命名";
        if (!amount) continue;
        await db.createCostEntry({
          projectId,
          name,
          amount,
          category: parts[3] || "其他",
          createdBy: userId,
        });
        costCount++;
      }
    } catch (err) {
      console.error("[Bot Import] Error:", err);
    }
  }

  const parts: string[] = [];
  if (taskCount > 0) parts.push(`${taskCount} 个任务`);
  if (costCount > 0) parts.push(`${costCount} 条成本`);

  return parts.length > 0
    ? `✅ 批量导入完成：${parts.join("，")}\n\n输入 !任务 查看 | !成本 统计 查看汇总`
    : "❌ 没有识别到有效数据。请检查格式：每行 任务,标题 或 成本,金额,名称。";
}
