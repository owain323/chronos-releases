// server/lib/storage.ts — 共享文件存储模块 (v4.0 T4)
// 从 server/_core/index.ts 提取, 供 web 上传与 bot 文件摄入共用

import path from "path";

export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
export const BOT_INBOX_DIR = "data/bot-inbox";

export const ALLOWED_EXT = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".txt", ".csv", ".xlsx", ".xls",
];

export const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "text/plain", "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const BOT_INBOX_MAX_COUNT = 20;
export const BOT_INBOX_MAX_TOTAL = 100 * 1024 * 1024; // 100MB
export const BOT_INBOX_TTL_MS = 600000; // 10 minutes

/** 净化文件名, 与 multer Date.now()+"-"+净化 规则一致 */
export function sanitizeFilename(original: string): string {
  return original
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_")
    .slice(0, 200);
}

/** 生成上传用的安全文件名 */
export function generateSafeFileName(original: string): string {
  return `${Date.now()}-${sanitizeFilename(original)}`;
}

/** 检查扩展名是否在白名单 */
export function isAllowedExt(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXT.includes(ext);
}

/** 检查 MIME 是否在白名单 */
export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.includes(mime);
}
