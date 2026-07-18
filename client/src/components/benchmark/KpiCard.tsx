// KpiCard — F-Shape 指标卡片 (v4.4 WO-FE-2, 共享组件)
// 左上营收/净利润, 适用于 benchmark + 项目材智报表
import { ConfidenceBadge } from "./ConfidenceBadge";

interface MetricItem {
  metricKey: string;
  metricValue?: number | null;
  unit?: string | null;
  confidence?: number | null;
}

const LABEL_MAP: Record<string, string> = {
  revenue: "营收",
  net_income: "净利润",
  gross_margin: "毛利率",
  net_margin: "净利率",
  roe: "ROE",
  roic: "ROIC",
  arr: "ARR",
  nrr: "NRR",
  sssg: "同店增长",
  nim: "净息差",
};

export function KpiCard({
  metrics,
  title,
}: {
  metrics: MetricItem[];
  title?: string;
}) {
  if (!metrics.length) return null;

  const formatVal = (v: number | null | undefined, key: string) => {
    if (v == null) return "—";
    if (["gross_margin", "net_margin", "roe", "roic", "nrr"].includes(key))
      return `${(v * 100).toFixed(1)}%`;
    return v.toLocaleString();
  };

  return (
    <div className="kpi-card border rounded-lg p-4 bg-white">
      {title && (
        <div className="text-sm text-muted-foreground mb-2">{title}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(m => (
          <div key={m.metricKey} className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              {LABEL_MAP[m.metricKey] || m.metricKey}
              <ConfidenceBadge confidence={m.confidence} />
            </span>
            <span className="text-lg font-semibold">
              {formatVal(m.metricValue, m.metricKey)}
              {m.unit && m.metricValue != null && (
                <span className="text-xs ml-1 font-normal text-muted-foreground">
                  {m.unit}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
