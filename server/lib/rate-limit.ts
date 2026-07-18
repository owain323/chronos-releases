/**
 * 限流 — Redis 优先，内存回退
 * 双窗口设计:
 *   - 失败窗口(MAX_FAILS/15min): 错误密码累计
 *   - 成功窗口(MAX_FAILS*3/15min): 合法请求累计
 * 成功登录即清零失败窗口
 *
 * v3.8 安全修复:
 *   - key 为任意维度字符串（如 `login:ip:1.2.3.4` / `login:acct:a@b.c`），
 *     登录失败按 ip + email 双维度分别计数
 *   - 新增 peekRateLimit: 只读预检，不清零失败窗口、不累计成功窗口。
 *     旧实现用 checkRateLimit(ip, false) 做预检会把失败计数清零，
 *     导致锁定预算被放大 3 倍（第 31 次才锁，而非设计的第 11 次）
 *   - 新增 checkEmailSendLimit: 按邮箱维度的发信限流（防邮件炸弹）
 *   - 配置可注入: createRateLimiter(opts) 工厂，模块级导出为读取
 *     config 的默认实例；测试可注入独立阈值，不再受模块级硬编码限制
 */
import { config } from "../config";

export interface RateLimitOptions {
  /** 窗口秒数，默认 config.rateLimit.windowSec */
  windowSec?: number;
  /** 失败窗口阈值，默认 config.rateLimit.maxFails */
  maxFails?: number;
  /** 成功窗口阈值，默认 maxFails * 3 */
  maxAttempts?: number;
  /** Redis 地址；空串 = 强制内存回退，默认 config.redis.url */
  redisUrl?: string;
  /** 邮件发送限流：每邮箱上限，默认 3 */
  emailSendMax?: number;
  /** 邮件发送限流窗口（毫秒），默认 1 小时 */
  emailSendWindowMs?: number;
}

export interface RateLimiter {
  checkRateLimit: (key: string, failed?: boolean) => Promise<boolean>;
  peekRateLimit: (key: string) => Promise<boolean>;
  resetRateLimit: (key: string) => Promise<void>;
  checkEmailSendLimit: (email: string) => boolean;
}

export function createRateLimiter(opts: RateLimitOptions = {}): RateLimiter {
  const WINDOW_SEC = opts.windowSec ?? config.rateLimit.windowSec;
  const MAX_FAILS = opts.maxFails ?? config.rateLimit.maxFails;
  const MAX_ATTEMPTS = opts.maxAttempts ?? MAX_FAILS * 3;
  const WINDOW_MS = WINDOW_SEC * 1000;
  const REDIS_URL = opts.redisUrl ?? config.redis.url;
  // 邮件发送限流（忘记密码等场景）：每邮箱 3 封/小时，内存计数
  const EMAIL_SEND_MAX = opts.emailSendMax ?? 3;
  const EMAIL_SEND_WINDOW_MS = opts.emailSendWindowMs ?? 60 * 60 * 1000;

  // 内存回退 (单实例)
  const memFailures = new Map<string, number[]>();
  const memAttempts = new Map<string, number[]>();
  const memEmailSends = new Map<string, number[]>();

  function memCheck(key: string, failed: boolean): boolean {
    const now = Date.now();
    if (failed) {
      const fails = memFailures.get(key) ?? [];
      const recent = fails.filter(t => now - t < WINDOW_MS);
      if (recent.length >= MAX_FAILS) {
        memFailures.set(key, recent);
        return false;
      }
      recent.push(now);
      memFailures.set(key, recent);
    } else {
      // 成功 → 清零失败计数
      memFailures.delete(key);
      // 累计合法请求(防止疯狂刷新)
      const atts = memAttempts.get(key) ?? [];
      const recent = atts.filter(t => now - t < WINDOW_MS);
      if (recent.length >= MAX_ATTEMPTS) {
        memAttempts.set(key, recent);
        return false;
      }
      recent.push(now);
      memAttempts.set(key, recent);
    }
    return true;
  }

  /** 只读预检：任一窗口已满则 false，不修改任何计数 */
  function memPeek(key: string): boolean {
    const now = Date.now();
    const fails = (memFailures.get(key) ?? []).filter(t => now - t < WINDOW_MS);
    if (fails.length >= MAX_FAILS) return false;
    const atts = (memAttempts.get(key) ?? []).filter(t => now - t < WINDOW_MS);
    if (atts.length >= MAX_ATTEMPTS) return false;
    return true;
  }

  async function redisCheck(key: string, failed: boolean): Promise<boolean> {
    try {
      const { getRedisClient } = await import("./redis");
      const r = await getRedisClient();
      if (!r) return memCheck(key, failed);
      if (failed) {
        const n = await r.incr(`rl:fail:${key}`);
        if (n === 1) await r.expire(`rl:fail:${key}`, WINDOW_SEC);
        return n <= MAX_FAILS;
      } else {
        // 成功 → 清零失败计数
        await r.del(`rl:fail:${key}`);
        const n = await r.incr(`rl:att:${key}`);
        if (n === 1) await r.expire(`rl:att:${key}`, WINDOW_SEC);
        return n <= MAX_ATTEMPTS;
      }
    } catch {
      return memCheck(key, failed);
    }
  }

  async function redisPeek(key: string): Promise<boolean> {
    try {
      const { getRedisClient } = await import("./redis");
      const r = await getRedisClient();
      if (!r) return memPeek(key);
      const [fails, atts] = await Promise.all([
        r.get(`rl:fail:${key}`),
        r.get(`rl:att:${key}`),
      ]);
      if (Number(fails ?? 0) >= MAX_FAILS) return false;
      if (Number(atts ?? 0) >= MAX_ATTEMPTS) return false;
      return true;
    } catch {
      return memPeek(key);
    }
  }

  /**
   * 限流检查（会修改计数）
   * @param key 限流维度键，如 `login:ip:1.2.3.4`、`login:acct:a@b.c`
   * @param failed true=失败(计入失败窗口) false=成功(清零失败窗口并累计合法请求)
   */
  async function checkRateLimit(key: string, failed = false): Promise<boolean> {
    if (REDIS_URL) return redisCheck(key, failed);
    return memCheck(key, failed);
  }

  /**
   * 只读限流预检 — 不清零失败窗口、不累计成功窗口
   * 用于「正式校验前的快速拒绝」，避免预检本身放大限流预算
   */
  async function peekRateLimit(key: string): Promise<boolean> {
    if (REDIS_URL) return redisPeek(key);
    return memPeek(key);
  }

  async function resetRateLimit(key: string): Promise<void> {
    memFailures.delete(key);
    memAttempts.delete(key);
    try {
      const { getRedisClient } = await import("./redis");
      const r = await getRedisClient();
      if (r) {
        await r.del(`rl:fail:${key}`);
        await r.del(`rl:att:${key}`);
      }
    } catch (err) {
      console.error("[rate-limit] resetRateLimit failed:", err);
    }
  }

  /**
   * 邮件发送限流 — 按邮箱维度，3 封/小时，内存计数
   * 防 forgotPassword 邮件炸弹；返回 false 表示超限
   */
  function checkEmailSendLimit(email: string): boolean {
    const now = Date.now();
    const key = email.toLowerCase();
    const recent = (memEmailSends.get(key) ?? []).filter(
      t => now - t < EMAIL_SEND_WINDOW_MS
    );
    if (recent.length >= EMAIL_SEND_MAX) {
      memEmailSends.set(key, recent);
      return false;
    }
    recent.push(now);
    memEmailSends.set(key, recent);
    return true;
  }

  // 定期清理内存；unref 使定时器不阻止进程/测试退出
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, fails] of Array.from(memFailures)) {
      const recent = fails.filter((t: number) => now - t < WINDOW_MS);
      if (recent.length === 0) memFailures.delete(key);
      else memFailures.set(key, recent);
    }
    for (const [key, atts] of Array.from(memAttempts)) {
      const recent = atts.filter((t: number) => now - t < WINDOW_MS);
      if (recent.length === 0) memAttempts.delete(key);
      else memAttempts.set(key, recent);
    }
    for (const [key, sends] of Array.from(memEmailSends)) {
      const recent = sends.filter(
        (t: number) => now - t < EMAIL_SEND_WINDOW_MS
      );
      if (recent.length === 0) memEmailSends.delete(key);
      else memEmailSends.set(key, recent);
    }
  }, 60_000);
  (timer as unknown as { unref?: () => void }).unref?.();

  return { checkRateLimit, peekRateLimit, resetRateLimit, checkEmailSendLimit };
}

// 模块级默认实例 — 读取全局 config，供生产代码直接 import 使用
const defaultLimiter = createRateLimiter();

export const checkRateLimit = defaultLimiter.checkRateLimit;
export const peekRateLimit = defaultLimiter.peekRateLimit;
export const resetRateLimit = defaultLimiter.resetRateLimit;
export const checkEmailSendLimit = defaultLimiter.checkEmailSendLimit;
