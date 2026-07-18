// server/lib/bot/media-handler.ts — 机器人文件摄入处理器 (v4.0 T2)
// 媒体下载 + 校验 + inbox 存储

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { BOT_INBOX_DIR, BOT_INBOX_TTL_MS, sanitizeFilename, MAX_FILE_SIZE } from "../storage";
import { insertInboxItem, listPendingInbox } from "../../db/botInbox";
import { assertMagicByte, assertFileSize, assertInboxLimit } from "./media-validate";
import { isTempBotUser, bindHint } from "./access";
import { logger } from "../logger";

interface MediaFile {
  mediaId: string;
  msgType: string;
  originalName?: string;
}

/** 下载企微媒体文件 */
async function downloadWecomMedia(mediaId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const token = await getWecomAccessToken();
  if (!token) return null;
  try {
    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/media/get?access_token=${token}&media_id=${mediaId}`,
      { signal: AbortSignal.timeout(30000) }
    );
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const buffer = Buffer.from(await resp.arrayBuffer());
    return { buffer, contentType };
  } catch {
    return null;
  }
}

let _wecomToken: { token: string; expiresAt: number } | null = null;

async function getWecomAccessToken(): Promise<string | null> {
  if (_wecomToken && _wecomToken.expiresAt > Date.now() + 60000) return _wecomToken.token;
  const corpId = process.env.WECOM_CORP_ID;
  const secret = process.env.WECOM_CORP_SECRET;
  if (!corpId || !secret) return null;
  try {
    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = (await resp.json()) as any;
    if (data.errcode !== 0) return null;
    _wecomToken = { token: data.access_token as string, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
    return _wecomToken.token;
  } catch {
    return null;
  }
}

/** 处理一条媒体消息, 返回回复文本 */
export async function handleBotMedia(
  media: MediaFile,
  platformUserId: string,
  webUserId: number | null, // 未登录为 null
  workspaceId: number | null
): Promise<string | null> {
  // 非绑定用户拒绝
  if (!webUserId) {
    return bindHint();
  }

  // per-user 上限检查
  const limit = assertInboxLimit(platformUserId);
  if (!limit.ok) return `❌ ${limit.message}`;

  // 下载媒体
  const dl = await downloadWecomMedia(media.mediaId);
  if (!dl) return "❌ 媒体文件下载失败，请稍后重试。";

  // 大小校验
  if (!assertFileSize(dl.buffer.length.toString(), MAX_FILE_SIZE)) {
    return "❌ 文件超出大小限制（最大 100MB）。";
  }

  // 文件名与 temp path
  const ext = media.originalName ? path.extname(media.originalName) : ".bin";
  const originalName = media.originalName || `${media.mediaId}${ext}`;
  const inboxDir = path.resolve(BOT_INBOX_DIR);
  if (!fs.existsSync(inboxDir)) fs.mkdirSync(inboxDir, { recursive: true });
  const tempName = crypto.randomUUID();
  const tempPath = path.join(inboxDir, tempName);

  // 写临时文件
  fs.writeFileSync(tempPath, dl.buffer);

  // magic-byte 校验
  if (!assertMagicByte(tempPath, dl.contentType)) {
    try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    logger.warn({ ctx: "bot" }, `[media-handler] magic-byte rejected: ${originalName} (${dl.contentType})`);
    return `❌ 文件类型 ${dl.contentType} 不被允许或文件格式异常。`;
  }

  // 插入 inbox
  const now = Date.now();
  insertInboxItem({
    botUserId: platformUserId,
    webUserId,
    workspaceId: workspaceId ?? undefined,
    originalName: sanitizeFilename(originalName),
    mime: dl.contentType,
    size: dl.buffer.length,
    tempPath,
    status: "pending",
    receivedAt: now,
    expiresAt: now + BOT_INBOX_TTL_MS,
  });

  return null; // 由聚合器生成统一回执
}

/** 生成收件箱汇总回执 */
export function buildInboxReply(botUserId: string): string {
  const items = listPendingInbox(botUserId) as any[];
  if (items.length === 0) return "📥 没有待保存的文件。";
  const byType: Record<string, number> = {};
  for (const item of items) {
    const label = item.mime?.startsWith("image/") ? "图片" : item.mime === "application/pdf" ? "PDF" : "文件";
    byType[label] = (byType[label] || 0) + 1;
  }
  const summary = Object.entries(byType).map(([k, v]) => `${k}×${v}`).join(", ");
  return `📥 收到 ${items.length} 个待保存文件（${summary}）。\n用 /save #项目名 指定保存位置，或 /save 存入当前项目。\n10 分钟内未保存将自动清理。`;
}
