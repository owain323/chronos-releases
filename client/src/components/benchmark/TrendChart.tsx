// TrendChart — 多Period折线图 (v4.4 WO-FE-4, 共享组件)
// 复用 recharts, 仅 data-source 参数区分 benchmark/project
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  label: string;
  value: number;
}

export function TrendChart({
  data,
  metricKey,
  height,
}: {
  data: TrendPoint[];
  metricKey: string;
  height?: number;
}) {
  if (!data.length) return null;

  return (
    <div className="trend-chart">
      <div className="text-xs text-muted-foreground mb-1">{metricKey}</div>
      <ResponsiveContainer width="100%" height={height || 200}>
        <LineChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
