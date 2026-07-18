import * as db from "../../../db";
import { contextHeader } from "./_utils";

export async function handleUpdate(
  taskId: number,
  args: string,
  projectId: number,
  userId: number
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const task = await db.getTaskById(taskId);
  if (!task) return `${ctx}\n\n❌ 找不到任务 #${taskId}`;

  // 解析：/更新 #5 新标题 [high] [明天]
  let title = args;
  let priority: string | undefined;
  let dueDate: string | undefined;

  const priMatch = title.match(/\s+(high|urgent|medium|low)\s*$/i);
  if (priMatch) {
    priority = priMatch[1].toLowerCase();
    title = title.replace(priMatch[0], "").trim();
  }

  const dateMatch = title.match(
    /\s+(明天|后天|下周一|下周二|下周三|下周四|下周五|\d{4}-\d{2}-\d{2})\s*$/i
  );
  if (dateMatch) {
    dueDate = parseRelDate(dateMatch[1]);
    title = title.replace(dateMatch[0], "").trim();
  }

  if (!title && !priority && !dueDate)
    return `${ctx}\n\n❌ 用法：/更新 #编号 <新标题> [优先级] [截止日]\n示例：/更新 #5 修复登录 urgent 明天`;

  const updates: Record<string, unknown> = {};
  if (title) updates.title = title;
  if (priority) updates.priority = priority;
  if (dueDate) updates.dueDate = dueDate;

  await db.updateTask(taskId, updates);

  const parts: string[] = [];
  if (title) parts.push(`标题→「${title}」`);
  if (priority) parts.push(`优先级→${priority}`);
  if (dueDate) parts.push(`截止→${dueDate}`);

  return `${ctx}\n\n✏️ #${taskId} 已更新：${parts.join("，")}`;
}

function parseRelDate(word: string): string | undefined {
  const today = new Date();
  const map: Record<string, number> = { 明天: 1, 后天: 2 };
  const days: Record<string, number> = {
    周一: 1,
    周二: 2,
    周三: 3,
    周四: 4,
    周五: 5,
    周六: 6,
    周日: 0,
  };
  if (map[word]) {
    today.setDate(today.getDate() + map[word]);
    return today.toISOString().split("T")[0];
  }
  const wd = word.replace("下", "");
  if (days[wd] !== undefined) {
    today.setDate(
      today.getDate() +
        ((days[wd] + 7 - today.getDay()) % 7) +
        (word.startsWith("下") ? 7 : 0)
    );
    return today.toISOString().split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(word)) return word;
  return undefined;
}
