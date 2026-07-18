import * as db from "../../../db";
import { contextHeader, footer, getUserName } from "./_utils";
import { listAccessibleProjects } from "../access";

/**
 * 列出当前用户可见的项目。
 * P0: 不再用 db.getAllProjects() 全量列出（会把其他 workspace 的项目名
 * 泄露给任意 bot 用户），改为逐项过 requireProjectAccess 过滤。
 */
export async function handleProjects(userId: number): Promise<string> {
  const visibleProjects = await listAccessibleProjects(userId);
  // 安全：历史硬编码 contextHeader(1, ...) 会把项目 #1 的名字泄露给任意
  // bot 用户（包括无权限者）。仅当用户确实能看到项目 #1 时才展示其名。
  const ctx = visibleProjects.some(p => p.id === 1)
    ? await contextHeader(1, userId)
    : `▸ 当前：${await getUserName(userId)}`;

  if (!visibleProjects.length)
    return `${ctx}\n\n📁 你还没有可访问的项目。在网页端创建一个，或让管理员把你加进项目。`;

  const lines: string[] = [ctx, "", "📁 **项目列表**\n"];
  visibleProjects.forEach(p =>
    lines.push(
      `  #${p.id} ${p.name}（${p.status || "活跃"} · ${p.createdAt?.slice(0, 10) || ""}）`
    )
  );
  lines.push(footer(["/项目 切换 #编号", "/任务"]));
  return lines.join("\n");
}

export async function handleProjectInfo(
  projectId: number,
  userId: number
): Promise<string> {
  const ctx = await contextHeader(projectId, userId);
  const p = await db.getProjectById(projectId);
  if (!p) return `❌ 项目 #${projectId} 不存在。/项目 查看全部。`;

  const tasks = await db.getTasksByProjectId(projectId);
  const costs = await db.getCostEntriesByProjectId(projectId);
  const files = await db.getFileStats(projectId);

  return [
    ctx,
    "",
    `📁 **${p.name}**`,
    p.description ? `  ${p.description}` : "",
    `  状态：${p.status || "活跃"}  |  任务：${tasks.length}  |  成本：${costs.length}  |  文件：${files.total}`,
    footer(["/任务", "/报表", "/成本 统计"]),
  ].join("\n");
}
