import * as db from "../../../db";
import { contextHeader, footer } from "./_utils";

export async function handleAssign(
  args: string,
  projectId: number,
  userId: number
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const parts = args.split("|||");
  const taskId = parseInt(parts[0], 10);
  const userName = parts[1]?.trim();

  if (!taskId || !userName)
    return `${ctx}\n\n❌ 用法：/指派 #编号 <人名>\n示例：/指派 #5 张三`;

  const task = await db.getTaskById(taskId);
  if (!task) return `${ctx}\n\n❌ 找不到任务 #${taskId}`;

  const members = await db.getProjectMembers(task.projectId);
  const allUsers = await Promise.all(
    members.map(async m => {
      const u = await db.getUserById(m.userId);
      return u ? { userId: m.userId, name: u.name || "" } : null;
    })
  );
  const validUsers = allUsers.filter(Boolean) as {
    userId: number;
    name: string;
  }[];
  const target = validUsers.find(
    u => u.name === userName || u.name.includes(userName)
  );

  if (!target) {
    const nameList = validUsers.map(u => u.name).join("、");
    return `${ctx}\n\n❌ 项目中没有「${userName}」\n当前成员：${nameList}`;
  }

  await db.updateTask(taskId, { assigneeId: target.userId });
  return [
    ctx,
    "",
    `✅ #${taskId}「${task.title}」→ 指派给 ${target.name}`,
    footer(["/我的", "/任务", "/指派 #编号 <人名>"]),
  ].join("\n");
}
