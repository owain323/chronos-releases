// ConfidenceBadge — 置信度可视化 (v4.4 WO-FE-2, 共享组件)
// ●高(≥0.9) / ◐中(≥0.7) / ○低(<0.7)
export function ConfidenceBadge({
  confidence,
}: {
  confidence?: number | null;
}) {
  if (confidence == null) return null;
  if (confidence >= 0.9)
    return <span title={`置信度 ${(confidence * 100).toFixed(0)}%`}>●</span>;
  if (confidence >= 0.7)
    return <span title={`置信度 ${(confidence * 100).toFixed(0)}%`}>◐</span>;
  return (
    <span title={`低置信度 ${(confidence * 100).toFixed(0)}%，仅供参考`}>
      ○
    </span>
  );
}
