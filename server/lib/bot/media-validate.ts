// server/lib/bot/media-validate.ts — 机器人文件摄入校验 (v4.0 T4)
// magic-byte 二次校验 + 大小/类型白名单 + per-user 上限

import { validateMagicByte } from "../../lib/magic-byte";
import { ALLOWED_MIME, BOT_INBOX_MAX_COUNT, BOT_INBOX_MAX_TOTAL } from "../../lib/storage";
import { countPending, listPendingInbox } from "../../db/botInbox";
import fs from "fs";
import path from "path";

/** 校验文件头 magic-byte (复用 server/lib/magic-byte.ts) */
export function assertMagicByte(filePath: string, declaredMime: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    return validateMagicByte(head, ALLOWED_MIME) !== null;
  } catch {
    return false;
  }
}

/** 校验大小 (文件路径或直接字节数) */
export function assertFileSize(filePathOrSize: string | number, maxSize = 25 * 1024 * 1024): boolean {
  try {
    if (typeof filePathOrSize === "number") {
      return filePathOrSize <= maxSize;
    }
    const stat = fs.statSync(filePathOrSize);
    return stat.size <= maxSize;
  } catch {
    return false;
  }
}

/** 校验 per-user 收件箱上限 (≤20 个 / ≤100MB) */
export function assertInboxLimit(botUserId: string): { ok: boolean; message?: string } {
  const count = countPending(botUserId);
  if (count >= BOT_INBOX_MAX_COUNT) {
    return { ok: false, message: `收件箱已满 (${count}/${BOT_INBOX_MAX_COUNT})，请先 /save 或 /discard` };
  }
  const items = listPendingInbox(botUserId);
  const totalSize = items.reduce((sum, i) => sum + (i.size || 0), 0);
  if (totalSize >= BOT_INBOX_MAX_TOTAL) {
    return {
      ok: false,
      message: `收件箱总大小已达上限 (${(totalSize / 1024 / 1024).toFixed(1)}MB/100MB)，请先 /save 或 /discard`,
    };
  }
  return { ok: true };
}
