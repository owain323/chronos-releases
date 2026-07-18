/**
 * Bot 服务 — 兼容层，逻辑已迁移到 server/lib/bot/
 * 保留此文件确保现有 import 不中断
 */
export { parseCommand } from "./bot/parser";
export { executeCommand, type CommandResult } from "./bot/executor";
export { handleBotCallback } from "./bot/callback";
