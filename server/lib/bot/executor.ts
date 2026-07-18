/**
 * Bot 命令执行器 v3 — 含注册/登录
 * P0 安全修复：dispatch 任何命令前统一过 assertBotCommandAllowed
 * （临时账号只放行绑定/帮助类命令；项目数据命令过 requireProjectAccess）。
 */
import { parseCommand } from "./parser";
import { handleTasks } from "./commands/tasks";
import { handleCreate } from "./commands/create";
import { handleComplete } from "./commands/complete";
import { handleToday } from "./commands/today";
import { handleCost, handleCostStats } from "./commands/cost";
import { handleReport } from "./commands/report";
import { handleImport } from "./commands/import";
import { handleHelp } from "./commands/help";
import { handleFiles, handleFileNotes } from "./commands/files";
import { handleProjects, handleProjectInfo } from "./commands/project";
import { handleSearch } from "./commands/search";
import { handleDelete } from "./commands/delete";
import { handleUpdate } from "./commands/update";
import { handleAssign } from "./commands/assign";
import { handleMy } from "./commands/my";
import { handleRegister } from "./commands/register";
import { handleLoginPassword } from "./commands/login";
import { handleSave, handleInbox, handleDiscard } from "./commands/save";
import { assertBotCommandAllowed, BotAccessDenied } from "./access";

export interface CommandResult {
  reply: string | any;
  /** 登录成功后传给 callback 用于绑定 */
  loggedInUserId?: number;
}

export async function executeCommand(
  text: string,
  userId: number,
  projectId: number,
  appUrl?: string
): Promise<CommandResult> {
  const cmd = parseCommand(text);

  try {
    // P0: 统一访问校验 —— 任何命令 dispatch 前先过权限闸
    // （project_switch 传 cmd.taskId 校验目标项目，file_notes 传 cmd.fileId 校验文件实体）
    await assertBotCommandAllowed(
      cmd.action,
      userId,
      projectId,
      cmd.fileId,
      cmd.taskId
    );

    let reply: string;
    let loggedInUserId: number | undefined;

    switch (cmd.action) {
      case "tasks":
        reply = await handleTasks(projectId, userId, false);
        break;
      case "task_all":
        reply = await handleTasks(projectId, userId, true);
        break;
      case "create":
        reply = await handleCreate(projectId, userId, cmd.args);
        break;
      case "complete":
        reply = await handleComplete(cmd.taskId!, projectId, userId);
        break;
      case "today":
        reply = await handleToday(projectId, userId);
        break;
      case "my":
        reply = await handleMy(projectId, userId);
        break;
      case "search":
        reply = (await handleSearch(projectId, cmd.args)) as any;
        break;
      case "delete":
        reply = await handleDelete(cmd.taskId!, projectId);
        break;
      case "update":
        reply = await handleUpdate(cmd.taskId!, cmd.args, projectId, userId);
        break;
      case "assign":
        reply = await handleAssign(cmd.args, projectId, userId);
        break;
      case "register":
        reply = await handleRegister(cmd.args);
        break;
      case "login_pw": {
        const result = await handleLoginPassword(cmd.args);
        reply = result.reply;
        loggedInUserId = result.chronosUserId;
        break;
      }
      case "cost": {
        if (
          !cmd.args ||
          ["统计", "stats", "查询"].includes(cmd.args.toLowerCase())
        )
          reply = await handleCostStats(projectId, userId);
        else reply = await handleCost(projectId, userId, cmd.args);
        break;
      }
      case "report":
        reply = await handleReport(projectId, userId, appUrl || "");
        break;
      case "import":
        reply = await handleImport(projectId, userId, cmd.args);
        break;
      case "files":
        reply = (await handleFiles(projectId, userId, cmd.args || "")) as any;
        break;
      case "file_notes":
        reply = await handleFileNotes(cmd.fileId!, cmd.args);
        break;
      case "project":
        reply = await handleProjects(userId);
        break;
      case "project_switch":
        reply = await handleProjectInfo(cmd.taskId!, userId);
        break;
      case "help":
        reply = handleHelp(appUrl);
        break;
      case "save":
        reply = await handleSave(userId, projectId, cmd.args || undefined);
        break;
      case "inbox":
        reply = handleInbox(String(userId));
        break;
      case "discard":
        reply = handleDiscard(String(userId), cmd.args === "yes");
        break;
      default:
        reply = "🤔 没看懂你的指令。\n\n试试 /help 查看全部命令。";
    }
    return { reply, loggedInUserId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    // 权限拒绝不按"执行出错"处理，直接返回引导/拒绝文案
    if (err instanceof BotAccessDenied) {
      return { reply: err.message };
    }
    console.error("[Bot] Command error:", err);
    return { reply: `❌ 执行出错：${err.message || "未知错误"}` };
  }
}
