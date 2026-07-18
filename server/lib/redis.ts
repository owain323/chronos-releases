// Redis 客户端 — 单例懒加载，无 Redis 时优雅回退
import { config } from "../config";

let client: any = null;
let useRedis = config.redis.url !== "";

export async function getRedisClient() {
  if (client) return client;
  if (!config.redis.url) {
    useRedis = false;
    return null;
  }
  try {
    // @ts-expect-error — optional redis dep
    const { createClient } = await import("redis");
    client = createClient({ url: config.redis.url });
    client.on("error", () => {
      useRedis = false;
      client = null;
    });
    await client.connect();
    return client;
  } catch {
    useRedis = false;
    return null;
  }
}

export function isRedisAvailable() {
  return useRedis && client !== null;
}

// Redis 限流: 跨实例共享
export async function redisCheckRateLimit(
  ip: string,
  maxFails = 300,
  windowSec = 900
): Promise<boolean> {
  const r = await getRedisClient();
  if (!r) return true; // Redis 不可用时放行，回退到内存限流
  const key = `rl:${ip}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, windowSec);
  return n <= maxFails;
}

export async function redisResetRate(ip: string) {
  const r = await getRedisClient();
  if (r) await r.del(`rl:${ip}`);
}
