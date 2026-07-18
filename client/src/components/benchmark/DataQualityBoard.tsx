// DataQualityBoard — 数据质量看板 (v4.4 WO-FE-6, 共享组件)
interface QualityProps {
  totalMetrics: number;
  availableMetrics: number;
  avgConfidence?: number;
  missingKeys: string[];
}

export function DataQualityBoard({
  totalMetrics,
  availableMetrics,
  avgConfidence,
  missingKeys,
}: QualityProps) {
  const completeness = totalMetrics
    ? (availableMetrics / totalMetrics) * 100
    : 0;
  const isLow = completeness < 80;

  return (
    <div className="quality-board border rounded-lg p-3 bg-white text-sm">
      <div className="font-semibold mb-2">数据质量</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          完整性:{" "}
          <span className={isLow ? "text-red-500" : "text-green-600"}>
            {completeness.toFixed(0)}%
          </span>
        </div>
        {avgConfidence != null && (
          <div>
            置信度:{" "}
            <span>
              {avgConfidence >= 0.9 ? "●" : avgConfidence >= 0.7 ? "◐" : "○"}{" "}
              {(avgConfidence * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
      {missingKeys.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground">缺失字段:</div>
          <div className="text-xs text-red-500">
            {missingKeys.slice(0, 5).join("、")}
            {missingKeys.length > 5 ? ` 等${missingKeys.length}项` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
