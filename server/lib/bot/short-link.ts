/**
 * 短链接服务 - 把 /api/view/16?code=1234 映射成 /v/abc123
 * 短码到 (fileId, code) 的映射存内存，重启清空
 */
import crypto from "crypto";

const shortIndex = new Map<string, { fileId: number; code: string }>();

/** 生成短码 */
export function createShortLink(fileId: number, code: string): string {
  // 8 字符随机短码（避免冲突）
  for (let i = 0; i < 20; i++) {
    const short = crypto.randomBytes(4).toString("hex");
    if (!shortIndex.has(short)) {
      shortIndex.set(short, { fileId, code });
      return short;
    }
  }
  return crypto.randomBytes(6).toString("hex");
}

/** 解析短码 */
export function resolveShortLink(
  short: string
): { fileId: number; code: string } | null {
  return shortIndex.get(short) || null;
}
