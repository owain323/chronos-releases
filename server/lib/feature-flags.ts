import { db, eq } from "../db/connection";
import { featureFlags } from "../db/featureFlags";

// Feature Flag 服务 — L2 功能开关
// 内存缓存 + 定期刷新，避免每次查 DB

let cache: Map<
  string,
  {
    key: string;
    type: "boolean" | "percentage" | "whitelist";
    enabled: boolean;
    percentage: number;
    whitelist: number[];
  }
> | null = null;

let lastRefresh = 0;
const CACHE_TTL = 30_000; // 30s

async function refreshCache(): Promise<void> {
  const rows = await db.select().from(featureFlags).all();
  cache = new Map();
  for (const row of rows) {
    cache.set(row.key, {
      key: row.key,
      type: row.type as "boolean" | "percentage" | "whitelist",
      enabled: row.enabled === 1,
      percentage: row.percentage ?? 0,
      whitelist: (row.whitelist as number[]) ?? [],
    });
  }
  lastRefresh = Date.now();
}

async function ensureCache(): Promise<void> {
  if (!cache || Date.now() - lastRefresh > CACHE_TTL) {
    try {
      await refreshCache();
    } catch {
      // 如果表不存在或 DB 不可用，使用空缓存（全部 feature 关闭）
      if (!cache) cache = new Map();
    }
  }
}

// 核心判断: 用户是否能看到该 feature
export async function isFeatureEnabled(
  flagKey: string,
  userId?: number
): Promise<boolean> {
  await ensureCache();
  const flag = cache?.get(flagKey);
  if (!flag) return false;

  // 不启用直接返回 false
  if (!flag.enabled) return false;

  switch (flag.type) {
    case "boolean":
      return true;
    case "percentage":
      // 没有 userId 时降级为 false
      if (!userId) return false;
      // 基于 userId 做确定性哈希，保证同一用户结果一致
      const hash = (userId * 2654435761) % 100;
      return hash < flag.percentage;
    case "whitelist":
      if (!userId) return false;
      return flag.whitelist.includes(userId);
    default:
      return false;
  }
}

// 批量判断
export async function getEnabledFeatures(userId?: number): Promise<string[]> {
  await ensureCache();
  if (!cache) return [];
  const enabled: string[] = [];
  const entries = Array.from(cache.entries());
  for (const [key] of entries) {
    if (await isFeatureEnabled(key, userId)) {
      enabled.push(key);
    }
  }
  return enabled;
}

// 设置/更新 feature flag（管理端用）
export async function setFeatureFlag(params: {
  key: string;
  label: string;
  description?: string;
  type: "boolean" | "percentage" | "whitelist";
  enabled: boolean;
  percentage?: number;
  whitelist?: number[];
}): Promise<void> {
  const existing = db
    .select()
    .from(featureFlags)
    .where(eq(featureFlags.key, params.key))
    .get();
  if (existing) {
    await db
      .update(featureFlags)
      .set({
        label: params.label,
        description: params.description ?? null,
        type: params.type,
        enabled: params.enabled ? 1 : 0,
        percentage: params.percentage ?? 0,
        whitelist: params.whitelist ?? [],
        updatedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } satisfies Record<string, unknown> as any)
      .where(eq(featureFlags.key, params.key))
      .execute();
  } else {
    await db
      .insert(featureFlags)
      .values({
        key: params.key,
        label: params.label,
        description: params.description ?? null,
        type: params.type,
        enabled: params.enabled ? 1 : 0,
        percentage: params.percentage ?? 0,
        whitelist: params.whitelist ?? [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .execute();
  }
  cache = null; // 立即刷新
}

// 获取所有 feature flags（管理端）
export async function listFeatureFlags() {
  return db.select().from(featureFlags).all();
}
