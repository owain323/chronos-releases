// SLO 计量系统 — L5 服务水平目标
// 通过内存聚合 + Express middleware 收集指标，定期写入 DB

interface SlidingWindow {
  total: number;
  errors: number;
  latencies: number[]; // 最近 200 个请求的 p95 计算
}

const windows = new Map<string, SlidingWindow>();
const MAX_LATENCY_SAMPLES = 200;

// 定义 SLO 目标
export const SLO_TARGETS = {
  availability: 0.995, // 99.5% — 每月允许 ~3.6 小时 downtime
  latencyP95: 500, // p95 < 500ms
  latencyP99: 2000, // p99 < 2s
};

// Express middleware: 每个请求记录
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sloMiddleware(req: any, res: any, next: () => void) {
  const start = Date.now();
  const endpoint = `${req.method} ${req.route?.path || req.path || "unknown"}`;

  res.on("finish", () => {
    const latency = Date.now() - start;
    const isError = res.statusCode >= 500;

    let w = windows.get(endpoint);
    if (!w) {
      w = { total: 0, errors: 0, latencies: [] };
      windows.set(endpoint, w);
    }

    w.total++;
    if (isError) w.errors++;

    // 滑动窗口：保留最近 MAX_LATENCY_SAMPLES 个延迟
    if (w.latencies.length >= MAX_LATENCY_SAMPLES) {
      w.latencies.shift();
    }
    w.latencies.push(latency);
  });

  next();
}

// 计算百分位延迟
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// 获取 SLO 指标快照（供 /api/slo 端点）
export function getSloSnapshot() {
  const endpoints: Record<
    string,
    {
      total: number;
      errors: number;
      availability: number;
      p50: number;
      p95: number;
      p99: number;
    }
  > = {};

  for (const [ep, w] of Array.from(windows.entries())) {
    const avail = w.total > 0 ? 1 - w.errors / w.total : 1;
    const sorted = [...w.latencies].sort((a, b) => a - b);
    endpoints[ep] = {
      total: w.total,
      errors: w.errors,
      availability: Math.round(avail * 10000) / 10000,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
    };
  }

  return {
    timestamp: Date.now(),
    targets: SLO_TARGETS,
    endpoints,
  };
}

// 获取 SLO 违规摘要
export function getSloViolations(): Array<{
  endpoint: string;
  metric: string;
  target: number;
  actual: number;
}> {
  const violations: Array<{
    endpoint: string;
    metric: string;
    target: number;
    actual: number;
  }> = [];

  for (const [ep, w] of Array.from(windows.entries())) {
    if (w.total < 10) continue; // 样本太少不报警

    const avail = 1 - w.errors / w.total;
    if (avail < SLO_TARGETS.availability) {
      violations.push({
        endpoint: ep,
        metric: "availability",
        target: SLO_TARGETS.availability,
        actual: Math.round(avail * 10000) / 10000,
      });
    }

    const sorted = [...w.latencies].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    if (p95 > SLO_TARGETS.latencyP95) {
      violations.push({
        endpoint: ep,
        metric: "latency_p95",
        target: SLO_TARGETS.latencyP95,
        actual: Math.round(p95),
      });
    }
  }

  return violations;
}

// 重置指标（用于测试或滚动窗口）
export function resetSloMetrics(): void {
  windows.clear();
}
