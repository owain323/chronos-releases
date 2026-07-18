import { db, eq, inArray, or } from "./connection";
import {
  projects,
  projectMembers,
  tasks,
  kanbanColumns,
} from "../../drizzle/schema";

/**
 * 单次查询：
 * 1. 取用户所属项目（owner 或 member）
 * 2. 批量取所有项目成员
 * 3. 批量取所有任务的看板列
 * 4. 批量取所有任务
 *
 * 之前：每个项目单独查 members + kanban + tasks → N 次往返
 */
export async function getDashboardStats(userId: number) {
  // 1. 取用户作为 owner 或 member 的所有项目
  const memberPids = db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId))
    .all()
    .map(m => m.projectId);
  // 1. 一次 SQL 查询：用户作为 owner 或 member 的所有项目
  const userProjects = db
    .select()
    .from(projects)
    .where(or(eq(projects.ownerId, userId), inArray(projects.id, memberPids)))
    .all();
  const projectIds = userProjects.map(p => p.id);
  if (projectIds.length === 0)
    return { totalProjects: 0, totalMembers: 0, pendingTasks: 0 };

  // 2. 仅取相关项目成员
  const allMembers =
    projectIds.length > 0
      ? db
          .select()
          .from(projectMembers)
          .where(inArray(projectMembers.projectId, projectIds))
          .all()
      : [];
  const uniqueUsers = new Set(allMembers.map(m => m.userId));

  // 3. 仅取相关项目已完成列
  const completedCols =
    projectIds.length > 0
      ? db
          .select()
          .from(kanbanColumns)
          .where(inArray(kanbanColumns.projectId, projectIds))
          .all()
          .filter(c => c.name === "已完成")
      : [];
  const completedColIds = new Set(completedCols.map(c => c.id));

  // 4. 仅取相关项目任务
  const allTasks =
    projectIds.length > 0
      ? db
          .select()
          .from(tasks)
          .where(inArray(tasks.projectId, projectIds))
          .all()
      : [];

  const pendingTasks = allTasks.filter(
    t => !completedColIds.has(t.columnId)
  ).length;

  return {
    totalProjects: projectIds.length,
    totalMembers: uniqueUsers.size,
    pendingTasks,
  };
}
