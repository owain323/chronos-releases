// AI Token 使用监控 — V3.8 可观测性
// 轻量内存聚合：按模型统计调用次数与 token 消耗，供 /api/ai-usage 暴露。
// 进程内计数，重启清零（监控类指标，无需持久化）。

interface AiModelUsage {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  lastUsedAt: number;
}

interface AiUsageInput {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

const store = new Map<string, AiModelUsage>();
const MAX_MODELS = 200;

export function recordAiUsage(
  model: string | undefined,
  usage?: AiUsageInput
): void {
  if (!usage) return;
  const key = model || "unknown";
  const cur =
    store.get(key) ||
    ({
      model: key,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      lastUsedAt: 0,
    } as AiModelUsage);
  cur.calls += 1;
  cur.promptTokens += usage.prompt_tokens ?? 0;
  cur.completionTokens += usage.completion_tokens ?? 0;
  cur.totalTokens += usage.total_tokens ?? 0;
  cur.lastUsedAt = Date.now();
  if (store.size < MAX_MODELS || store.has(key)) {
    store.set(key, cur);
  }
}

export function getAiUsageSnapshot(): {
  generatedAt: number;
  models: AiModelUsage[];
  totals: { calls: number; totalTokens: number };
} {
  const models = Array.from(store.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens
  );
  const totals = models.reduce(
    (acc, m) => {
      acc.calls += m.calls;
      acc.totalTokens += m.totalTokens;
      return acc;
    },
    { calls: 0, totalTokens: 0 }
  );
  return { generatedAt: Date.now(), models, totals };
}

export function resetAiUsage(): void {
  store.clear();
}
