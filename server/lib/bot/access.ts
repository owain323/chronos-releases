/**
 * Bot 统一访问控制（P0 安全修复）
 *
 * 修复漏洞：bot 回调零认证 + 命令零权限校验 → 未授权跨租户数据外泄。
 *
 * 两道防线：
 *  1) 临时账号（bot 自动创建、未绑定正式账号的 users 记录）禁止一切项目数据命令，
 *     只放行 /帮助、/注册、/登录 等绑定类命令。
 *  2) 所有项目数据命令执行前统一走 server/lib/project-guard.ts 的
 *     requireProjectAccess —— 与 tRPC HTTP 层共用同一份 workspace/项目守卫逻辑，
 *     避免 bot 通道绕过租户隔离。
 */
import { TRPCError } from "@trpc/server";
import { requireProjectAccess, requireEntityAccess } from "../project-guard";
import * as db from "../../db";

/** 权限拒绝 — executor/callback 捕获后转成对用户友好的回复文案 */
export class BotAccessDenied extends Error {}

/** 临时账号看到的绑定引导 */
const BIND_HINT =
  "🔒 你当前是临时账号，无权访问项目数据。\n\n" +
  "请先绑定正式账号：\n" +
  "📌 /注册 用户名 密码 → 创建新账号\n" +
  "🔑 在网站 /settings 生成验证码 → 发 login <验证码>\n" +
  "🔍 /登录 用户名 密码 → 登录已有账号";

/**
 * 临时账号放行的命令 action（不触碰任何项目数据）。
 * unknown 也放行 —— 它只是回一句"没看懂"，无数据泄露面。
 */
const TEMP_ALLOWED_ACTIONS = new Set([
  "help",
  "register",
  "login_pw",
  "unknown",
]);

/** 项目数据命令：执行前必须过 requireProjectAccess */
const PROJECT_SCOPED_ACTIONS = new Set([
  "tasks",
  "task_all",
  "create",
  "complete",
  "today",
  "my",
  "search",
  "delete",
  "update",
  "assign",
  "cost",
  "report",
  "import",
  "files",
  "save",
  // project_switch 特殊处理：校验目标项目而非上下文项目，见下方分支
]);

/**
 * 判断 userId 是否为 bot 自动创建的临时账号。
 * 临时账号特征：loginMethod 为平台名（wecom/dingtalk）且未设置密码。
 * 通过 /注册 或验证码/密码登录绑定后，bot_user_context.chronosUserId 指向
 * 正式账号（loginMethod 为 bot/local/email 等），即不再视为临时账号。
 * 用户不存在时从严按临时账号处理。
 */
export async function isTempBotUser(userId: number): Promise<boolean> {
  const user = await db.getUserById(userId);
  if (!user) return true;
  const platformAccount =
    user.loginMethod === "wecom" || user.loginMethod === "dingtalk";
  return platformAccount && !user.passwordHash;
}

/**
 * 命令级统一入口校验。executor 在 dispatch 任何命令前调用。
 * @param action  parser 解析出的命令 action
 * @param userId  当前 bot 上下文绑定的 chronosUserId
 * @param projectId 当前上下文项目
 * @param fileId  file_notes 命令的目标文件（实体级校验）
 */
export async function assertBotCommandAllowed(
  action: string,
  userId: number,
  projectId: number,
  fileId?: number,
  targetProjectId?: number
): Promise<void> {
  // 第一道：临时账号只放行绑定/帮助类命令
  if (await isTempBotUser(userId)) {
    if (!TEMP_ALLOWED_ACTIONS.has(action)) {
      throw new BotAccessDenied(BIND_HINT);
    }
    return;
  }

  // 第二道：实体级 / 项目级访问校验（复用 tRPC 层守卫）
  if (action === "file_notes") {
    if (!fileId) return; // 参数缺失由 handler 自己报错，不涉及越权
    try {
      await requireEntityAccess("file", fileId, userId);
    } catch {
      throw new BotAccessDenied("❌ 文件不存在或你没有访问权限。");
    }
    return;
  }

  // /项目 切换 #N 的目标项目不是当前上下文项目，必须单独校验目标
  if (action === "project_switch") {
    if (targetProjectId) await assertBotProjectAccess(userId, targetProjectId);
    return;
  }

  if (PROJECT_SCOPED_ACTIONS.has(action)) {
    await assertBotProjectAccess(userId, projectId);
  }
  // project（列表）不在此校验 —— 由 handleProjects 逐项过滤可见项目
}

/**
 * 项目访问校验（/切换 与项目数据命令共用）。
 * 对外统一口径：不区分"不存在"与"无权"，避免项目 ID 存在性枚举。
 */
export async function assertBotProjectAccess(
  userId: number,
  projectId: number
): Promise<void> {
  if (await isTempBotUser(userId)) {
    throw new BotAccessDenied(BIND_HINT);
  }
  try {
    await requireProjectAccess(userId, projectId);
  } catch (e) {
    if (e instanceof TRPCError) {
      throw new BotAccessDenied(
        `❌ 项目 #${projectId} 不存在或你没有访问权限。`
      );
    }
    throw e;
  }
}

/**
 * 列出当前用户可见的项目（/项目 命令用）。
 * 逐项过 requireProjectAccess，无权的项目直接不可见（名称也不泄露）。
 */
export async function listAccessibleProjects(userId: number) {
  const all = await db.getAllProjects();
  const visible: typeof all = [];
  for (const p of all) {
    try {
      await requireProjectAccess(userId, p.id);
      visible.push(p);
    } catch {
      /* 无权项目 → 不可见 */
    }
  }
  return visible;
}

/** 绑定引导文案（callback 新用户欢迎语等场景复用） */
export function bindHint(): string {
  return BIND_HINT;
}
