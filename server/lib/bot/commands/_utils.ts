/**
 * Bot 命令共享工具
 * 所有命令 handler 统一调用的 helper 函数
 */
import * as db from "../../../db";

/** 获取用户名 */
export async function getUserName(userId: number): Promise<string> {
  const user = await db.getUserById(userId);
  return user?.name || `用户#${userId}`;
}

/** 获取项目名 */
export async function getProjectName(projectId: number): Promise<string> {
  const p = await db.getProjectById(projectId);
  return p?.name || `项目#${projectId}`;
}

/** 生成上下文头：[项目: XX | 用户: XX] */
export async function contextHeader(
  projectId: number,
  userId: number
): Promise<string> {
  const [projectName, userName] = await Promise.all([
    getProjectName(projectId),
    getUserName(userId),
  ]);
  return `▸ 项目：${projectName}  |  当前：${userName}`;
}

/** 通用 footer：提示下一步操作 */
export function footer(cmds: string[]): string {
  return `\n—\n可操作：${cmds.map(c => `${c}`).join(" · ")}`;
}

/** 优先级 emoji 映射 */
export const PRI_EMOJI: Record<string, string> = {
  urgent: "🔴",
  high: "🟠",
  medium: "🔵",
  low: "⚪",
};

/** 获取优先级 emoji */
export function priEmoji(p: string | null | undefined): string {
  return PRI_EMOJI[p || "medium"] || "⚪";
}

/** 格式：如果 n 天后到期 */
export function dueHint(dueDate: string | null | undefined): string {
  if (!dueDate) return "";
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return " ⚠️超期";
  if (days === 0) return " ⏰今天到期";
  if (days <= 3) return ` ⏰${days}天后`;
  return "";
}
