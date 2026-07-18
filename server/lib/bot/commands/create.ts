import * as db from "../../../db";
import { contextHeader, footer, priEmoji } from "./_utils";

/** 创建任务：/创建 <标题> [优先级] [明天|下周一|YYYY-MM-DD] */
export async function handleCreate(
  projectId: number,
  userId: number,
  args: string
): Promise<string> {
  // 解析：标题 [high|urgent] [明天|下周一|日期]
  let title = args;
  let priority = "medium" as string;
  let dueDate: string | undefined;

  const priMatch = title.match(/\s+(high|urgent|medium|low)\s*$/i);
  if (priMatch) {
    priority = priMatch[1].toLowerCase();
    title = title.replace(priMatch[0], "").trim();
  }

  const dateMatch = title.match(
    /\s+(明天|后天|下周一|下周二|下周三|下周四|下周五|下周|周末|\d{4}-\d{2}-\d{2})\s*$/i
  );
  if (dateMatch) {
    dueDate = parseDate(dateMatch[1]);
    title = title.replace(dateMatch[0], "").trim();
  }

  if (!title || title.length < 1)
    return "❌ 请输入任务标题。\n用法：/创建 <标题> [优先级] [截止日]\n示例：/创建 修复登录Bug high 明天";

  let columns = await db.getKanbanColumnsByProjectId(projectId);
  if (!columns.length) {
    await db.createKanbanColumn({ projectId, name: "待办", order: 0 });
    await db.createKanbanColumn({ projectId, name: "进行中", order: 1 });
    await db.createKanbanColumn({ projectId, name: "已完成", order: 2 });
    columns = await db.getKanbanColumnsByProjectId(projectId);
  }

  const todoCol = columns.find(c => c.name === "待办") || columns[0];
  const existing = await db.getTasksByColumnId(todoCol.id);

  await db.createTask({
    projectId,
    columnId: todoCol.id,
    title,
    creatorId: userId,
    order: existing.length,
    priority: priority as "high" | "medium" | "low",
    dueDate: dueDate ? new Date(dueDate) : undefined,
  });

  const ctx = await contextHeader(projectId, userId);
  const dueStr = dueDate ? ` · 截止：${dueDate}` : "";
  return [
    ctx,
    "",
    `✅ 任务已创建`,
    `   ${priEmoji(priority)} ${title}${dueStr}`,
    footer(["/任务 查看待办", "/我的", "/指派 #编号 <人名>"]),
  ].join("\n");
}

function parseDate(word: string): string | undefined {
  const today = new Date();
  const formats: Record<string, number> = { 明天: 1, 后天: 2 };
  const dayMap: Record<string, number> = {
    周一: 1,
    周二: 2,
    周三: 3,
    周四: 4,
    周五: 5,
    周六: 6,
    周日: 0,
  };

  if (formats[word] !== undefined) {
    today.setDate(today.getDate() + formats[word]);
    return today.toISOString().split("T")[0];
  }
  if (dayMap[word.replace("下", "")] !== undefined) {
    const targetDay = dayMap[word.replace("下", "")];
    today.setDate(
      today.getDate() +
        ((targetDay + 7 - today.getDay()) % 7) +
        (word.startsWith("下") ? 7 : 0)
    );
    return today.toISOString().split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return word;
  return undefined;
}
