/**
 * 文件分享码管理器
 * 内存级存储，crypto.randomBytes 安全分享码，24 小时过期
 */
import crypto from "crypto";

interface ShareEntry {
  fileId: number;
  projectId: number;
  createdAt: number;
}

const store = new Map<string, ShareEntry>();
const CODE_LIFETIME = 24 * 60 * 60 * 1000; // 24 小时

/** 生成一个未使用的安全分享码 �?crypto.randomBytes(12) base64url */
function generateCode(): string {
  for (let i = 0; i < 100; i++) {
    const code = crypto.randomBytes(12).toString("base64url");
    if (!store.has(code)) return code;
  }
  // 极端情况：清理过期后再试
  cleanExpired();
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** 清理过期条目 */
function cleanExpired() {
  const now = Date.now();
  store.forEach((entry, code) => {
    if (now - entry.createdAt > CODE_LIFETIME) store.delete(code);
  });
}

/** 为文件生成分享码 */
export function createShareCode(fileId: number, projectId: number): string {
  cleanExpired();
  const code = generateCode();
  store.set(code, { fileId, projectId, createdAt: Date.now() });
  return code;
}

/** 验证分享码，返回文件ID */
export function redeemShareCode(code: string): ShareEntry | null {
  cleanExpired();
  const entry = store.get(code);
  if (!entry) return null;
  // 验证完不删除�?4 小时内可反复使用
  return entry;
}
