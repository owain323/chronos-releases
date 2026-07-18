/**
 * 简易内存缓存 — 单进程架构适用。
 * NOTE: 横向扩展时须替换为 Redis。
 */
const MAX_SIZE = 1000;
const store = new Map<string, { data: any; expires: number }>();

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  store.forEach((val, key) => {
    if (now >= val.expires) store.delete(key);
  });
}, 600_000).unref();

/** 5 分钟默认 TTL，超出 MAX_SIZE 时淘汰最老的条目 */
export function getCached<T>(
  key: string,
  fetcher: () => T,
  ttlMs = 300_000
): T {
  const cached = store.get(key);
  if (cached && Date.now() < cached.expires) return cached.data as T;
  // LRU-lite: 超出上限淘汰最早过期的
  if (store.size >= MAX_SIZE) {
    let oldestKey = "",
      oldestExp = Infinity;
    store.forEach((v, k) => {
      if (v.expires < oldestExp) {
        oldestExp = v.expires;
        oldestKey = k;
      }
    });
    store.delete(oldestKey);
  }
  const data = fetcher();
  store.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

export function invalidateCache(pattern?: string) {
  if (!pattern) {
    store.clear();
    return;
  }
  for (const key of Array.from(store.keys())) {
    if (key.includes(pattern)) store.delete(key);
  }
}
