// server/lib/storage.ts — 共享文件存储模块 (v4.0 T4)
// 从 server/_core/index.ts 提取, 供 web 上传与 bot 文件摄入共用

import path from "path";

export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
export const BOT_INBOX_DIR = "data/bot-inbox";

export const ALLOWED_EXT = [
  // 图片
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".ico", ".svg",
  // 文档
  ".pdf",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".csv", ".md", ".json", ".xml", ".html", ".htm",
  // 压缩
  ".zip", ".rar", ".7z", ".gz",
  // 音视频 (机器人可接收)
  ".mp3", ".wav", ".mp4", ".webm", ".avi", ".mov",
];

export const ALLOWED_MIME = [
  // 图片
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp",
  "image/svg+xml", "image/vnd.microsoft.icon",
  // 文档
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // 文本
  "text/plain", "text/csv", "text/markdown",
  "application/json", "application/xml", "text/xml",
  "text/html",
  // 压缩
  "application/zip", "application/x-rar-compressed",
  "application/x-7z-compressed", "application/gzip",
  // 音视频
  "audio/mpeg", "audio/wav", "video/mp4", "video/webm",
  "video/x-msvideo", "video/quicktime",
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
