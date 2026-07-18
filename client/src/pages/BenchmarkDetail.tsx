// BenchmarkDetailPage — 实体对标页 (v4.4 WO-FE-2/3/5)
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { KpiCard } from "@/components/benchmark/KpiCard";
import { IndustryBaselineBar } from "@/components/benchmark/IndustryBaselineBar";
import { TrendChart } from "@/components/benchmark/TrendChart";
import { DataQualityBoard } from "@/components/benchmark/DataQualityBoard";
import { CaliberHint } from "@/components/benchmark/CaliberHint";

export function BenchmarkDetailPage() {
  const { id } = useParams();
  const entityId = Number(id);

  const { data: entity, isLoading } = trpc.benchmark.getEntity.useQuery(
    { id: entityId },
    { enabled: !!entityId }
  );

  const latestPeriod = entity?.periods?.[0];
  const periodId = latestPeriod?.id;

  const { data: metrics = [] } = trpc.benchmark.listMetrics.useQuery(
    { periodId: periodId! },
    { enabled: !!periodId }
  );

  const { data: baselineRes } = trpc.benchmark.getBaseline.useQuery(
    {
      gicsGroup: (entity as any)?.gicsGroup || "",
      metricKey: "revenue",
    },
    { enabled: !!(entity as any)?.gicsGroup }
  );

  const { data: baselines = [] } = trpc.benchmark.compare.useQuery(
    { periodId: periodId!, projectId: 0 },
    { enabled: !!periodId }
  );

  const trendData =
    entity?.periods
      ?.filter((p: any) => p.periodType === "FY")
      .map((p: any) => {
        const ym = metrics.find(
          (m: any) => m.periodId === p.id && m.metricKey === "revenue"
        );
        return { label: p.label, value: ym?.metricValue ?? 0 };
      })
      .filter((d: any) => d.value > 0)
      .reverse() || [];

  const missingKeys = metrics
    .filter((m: any) => m.metricValue == null)
    .map((m: any) => m.metricKey);
  const confidenceVals = metrics
    .filter((m: any) => m.confidence != null)
    .map((m: any) => m.confidence);
  const avgConfidence = confidenceVals.length
    ? confidenceVals.reduce((a: number, b: number) => a + b, 0) /
      confidenceVals.length
    : null;

  if (isLoading) return <div className="p-6">加载中...</div>;
  if (!entity) return <div className="p-6">实体不存在</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-1">
        {entity.name}
        {(entity as any).ticker && (
          <span className="text-muted-foreground ml-2 text-base">
            ({(entity as any).ticker})
          </span>
        )}
      </h1>
      <div className="text-sm text-muted-foreground mb-4">
        {(entity as any).gicsGroup}{" "}
        {(entity as any).market && `· ${(entity as any).market}`}
      </div>

      {latestPeriod && (
        <>
          <KpiCard
            metrics={metrics.slice(0, 6)}
            title={latestPeriod.label ?? undefined}
          />

          {baselineRes && (
            <div className="mt-4 space-y-2">
              {metrics
                .slice(0, 3)
                .map(
                  (m: any) =>
                    m.metricValue != null && (
                      <IndustryBaselineBar
                        key={m.metricKey}
                        metricKey={m.metricKey}
                        userValue={m.metricValue}
                        median={
                          (baselines as any[]).find(
                            (b: any) => b.metricKey === m.metricKey
                          )?.median
                        }
                        p25={
                          (baselines as any[]).find(
                            (b: any) => b.metricKey === m.metricKey
                          )?.p25
                        }
                        p75={
                          (baselines as any[]).find(
                            (b: any) => b.metricKey === m.metricKey
                          )?.p75
                        }
                      />
                    )
                )}
            </div>
          )}

          <div className="mt-4">
            <TrendChart data={trendData} metricKey="revenue" />
          </div>

          <div className="mt-4">
            <DataQualityBoard
              totalMetrics={metrics.length}
              availableMetrics={
                metrics.filter((m: any) => m.metricValue != null).length
              }
              avgConfidence={avgConfidence ?? undefined}
              missingKeys={missingKeys}
            />
          </div>
        </>
      )}
    </div>
  );
}
