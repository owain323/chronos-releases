// server/lib/bot/commands/save.ts — /save /inbox /discard 命令 (v4.0 T5)
import fs from "fs";
import path from "path";
import { listPendingInbox, markInboxCommitted, discardInbox, countPending } from "../../../db/botInbox";
import { createFileSnapshot } from "../../../db/files";
import { UPLOADS_DIR, generateSafeFileName } from "../../storage";
import { assertBotProjectAccess } from "../access";

/** /save <项目名或#id> — 落盘所有pending到指定项目 */
export async function handleSave(userId: number, currentProjectId: number, projectRef?: string): Promise<string> {
  const botUserId = String(userId);
  const items = listPendingInbox(botUserId);
  if (items.length === 0) return "📭 没有待保存的文件。";

  // 解析项目
  let projectId = projectRef ? parseInt(projectRef, 10) : currentProjectId || 0;
  if (isNaN(projectId) && projectRef) {
    // 按名称匹配
    projectId = 0; // TODO full name-match (implement later with listAccessibleProjects)
    return "⚠️ 按项目名称搜索暂不支持，请使用 /save #项目编号。";
  }
  if (!projectId) return "❌ 请指定项目（/save #编号）或先 /切换 项目。";

  // 权限检查
  try {
    await assertBotProjectAccess(userId, projectId);
  } catch (e: any) {
    return `❌ ${e.message || "无权访问该项目"}`;
  }

  let saved = 0;
  for (const item of items) {
    try {
      const safeName = generateSafeFileName(item.originalName);
      const destPath = path.join(UPLOADS_DIR, safeName);
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.copyFileSync(item.tempPath, destPath);
      await createFileSnapshot({
        projectId,
        fileName: item.originalName,
        fileKey: safeName,
        fileUrl: `/uploads/${safeName}`,
        fileSize: item.size || undefined,
        mimeType: item.mime || undefined,
        uploadedBy: item.webUserId || 0,
      });
      markInboxCommitted(item.id);
      try { fs.unlinkSync(item.tempPath); } catch { /* ignore */ }
      saved++;
    } catch (e: any) {
      console.warn(`[save] failed for ${item.originalName}:`, e.message);
    }
  }

  return `✅ 已保存 ${saved}/${items.length} 个文件到 #${projectId}。`;
}

/** /inbox — 列出待保存文件 */
export function handleInbox(botUserId: string): string {
  const items = listPendingInbox(botUserId);
  if (items.length === 0) return "📭 收件箱为空。";

  const lines = [`📥 收件箱 (${items.length} 个待保存文件):`];
  for (const item of items) {
    const remaining = Math.max(0, Math.round((item.expiresAt - Date.now()) / 60000));
    const sizeStr = item.size ? `${(item.size / 1024).toFixed(1)}KB` : "未知";
    lines.push(`  ${item.originalName} (${sizeStr}, ${remaining}分钟后过期)`);
  }
  lines.push(`\n用 /save #项目 保存，或 /discard 清空。`);
  return lines.join("\n");
}

/** /discard — 清空收件箱 */
export function handleDiscard(botUserId: string, confirmed?: boolean): string {
  if (!confirmed) {
    const count = countPending(botUserId);
    if (count === 0) return "📭 收件箱为空，无需清空。";
    return `⚠️ 确认丢弃 ${count} 个待保存文件？\n回复 /discard yes 确认操作。`;
  }
  discardInbox(botUserId);
  return "🗑️ 收件箱已清空。";
}
