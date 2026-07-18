// IndustryBaselineBar — 行业基线柱状图 (v4.4 WO-FE-2, 共享组件)
// 用户值 vs Median/P25/P75 三档柱
export function IndustryBaselineBar({
  metricKey,
  userValue,
  median,
  p25,
  p75,
}: {
  metricKey: string;
  userValue: number;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
}) {
  if (median == null) return null;

  const maxVal = Math.max(userValue, p75 ?? 0, median) * 1.2;
  const barW = (v: number) => `${(v / maxVal) * 100}%`;

  return (
    <div className="baseline-bar text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-muted-foreground">{metricKey}</span>
        <span className="font-semibold">{userValue.toLocaleString()}</span>
        <span className="text-muted-foreground">vs</span>
        <span>中位 {median.toLocaleString()}</span>
      </div>
      <div className="h-5 bg-gray-100 rounded relative">
        {p25 != null && (
          <div
            className="absolute top-0 h-full bg-gray-200"
            style={{ left: 0, width: barW(p25) }}
          />
        )}
        <div
          className="absolute top-0 h-full bg-blue-200"
          style={{ left: 0, width: barW(median) }}
        />
        <div
          className="absolute top-0 h-2 bg-green-500 rounded"
          style={{
            left: barW(userValue),
            width: 4,
            transform: "translateX(-2px)",
          }}
          title={`你的值: ${userValue}`}
        />
        <div className="absolute inset-0 flex items-center justify-around text-[10px] text-gray-500">
          {p25 != null && <span>P25: {p25.toLocaleString()}</span>}
          <span>Med: {median.toLocaleString()}</span>
          {p75 != null && <span>P75: {p75.toLocaleString()}</span>}
        </div>
      </div>
    </div>
  );
}
