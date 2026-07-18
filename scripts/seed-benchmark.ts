// scripts/seed-benchmark.ts — Node seed: normalized JSON → SQLite (v4.4 WO-DATA-1b)
// 用法: npx tsx scripts/seed-benchmark.ts [archive_dir]
// 默认读取 BENCHMARK_ARCHIVE_DIR 或 ./benchmark_archive/normalized/*.json
// 幂等: UPSERT on unique constraints

import fs from "fs";
import path from "path";
import { db } from "../server/db/connection";
import { eq, and, sql } from "drizzle-orm";
import {
  benchmarkEntities,
  benchmarkPeriods,
  benchmarkMetrics,
  benchmarkSources,
  benchmarkFacts,
  benchmarkIndustryBaseline,
} from "../server/db/schema-benchmark";

interface NormalizedRecord {
  entity: {
    name: string;
    ticker?: string;
    market?: string;
    gics_group?: string;
    gics_sub?: string;
  };
  period: {
    period_type: string;
    fiscal_year: number;
    label?: string;
    start_date?: string;
    end_date?: string;
  };
  standard?: string;
  source: {
    source_url: string;
    license_note: string;
  };
  metrics: Array<{
    metric_key: string;
    value: number;
    unit?: string;
    confidence?: number;
  }>;
}

function loadNormalizedFiles(
  dir: string
): { file: string; data: NormalizedRecord }[] {
  if (!fs.existsSync(dir)) {
    console.log(`[seed] 目录不存在: ${dir}, 跳过`);
    return [];
  }
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
  const results: { file: string; data: NormalizedRecord }[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      const data = JSON.parse(raw) as NormalizedRecord;
      results.push({ file: f, data });
    } catch (e) {
      console.error(`[seed] 解析失败: ${f}`, e);
    }
  }
  return results;
}

function upsertEntity(e: NormalizedRecord["entity"]) {
  const existing = db
    .select()
    .from(benchmarkEntities)
    .where(eq(benchmarkEntities.name, e.name))
    .get();
  if (existing) return existing.id;

  const result = db
    .insert(benchmarkEntities)
    .values({
      name: e.name,
      ticker: e.ticker || null,
      market: e.market || null,
      gicsGroup: e.gics_group || "Unclassified",
      gicsSub: e.gics_sub || null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Number(result.lastInsertRowid);
}

function upsertPeriod(entityId: number, p: NormalizedRecord["period"]) {
  const existing = db
    .select()
    .from(benchmarkPeriods)
    .where(
      and(
        eq(benchmarkPeriods.entityId, entityId),
        eq(benchmarkPeriods.periodType, p.period_type),
        eq(benchmarkPeriods.fiscalYear, p.fiscal_year)
      )
    )
    .get();
  if (existing) return existing.id;

  const result = db
    .insert(benchmarkPeriods)
    .values({
      entityId,
      periodType: p.period_type,
      fiscalYear: p.fiscal_year,
      label: p.label || `${p.fiscal_year} ${p.period_type}`,
      startDate: p.start_date || null,
      endDate: p.end_date || null,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Number(result.lastInsertRowid);
}

function upsertSource(
  entityId: number,
  periodId: number,
  s: NormalizedRecord["source"],
  standard?: string
) {
  const existing = db
    .select()
    .from(benchmarkSources)
    .where(
      and(
        eq(benchmarkSources.entityId, entityId),
        eq(benchmarkSources.periodId, periodId),
        eq(benchmarkSources.sourceUrl, s.source_url)
      )
    )
    .get();
  if (existing) return existing.id;

  const result = db
    .insert(benchmarkSources)
    .values({
      entityId,
      periodId,
      sourceUrl: s.source_url,
      licenseNote: s.license_note,
      standard: standard || null,
      importedBy: "seed-benchmark",
      version: 1,
      superseded: 0,
      createdAt: new Date().toISOString(),
    })
    .run();
  return Number(result.lastInsertRowid);
}

function upsertMetrics(
  periodId: number,
  sourceId: number,
  metrics: NormalizedRecord["metrics"]
) {
  let inserted = 0;
  for (const m of metrics) {
    const existing = db
      .select()
      .from(benchmarkMetrics)
      .where(
        and(
          eq(benchmarkMetrics.periodId, periodId),
          eq(benchmarkMetrics.metricKey, m.metric_key)
        )
      )
      .get();
    if (existing) continue; // 幂等跳过

    db.insert(benchmarkMetrics)
      .values({
        periodId,
        metricKey: m.metric_key,
        metricValue: m.value,
        unit: m.unit || "CNY",
        confidence: m.confidence ?? 1.0,
        sourceId,
        createdAt: new Date().toISOString(),
      })
      .run();
    inserted++;
  }
  return inserted;
}

function deriveFacts(
  entityId: number,
  entityName: string,
  periodId: number,
  sourceId: number,
  metrics: NormalizedRecord["metrics"]
) {
  let derived = 0;
  for (const m of metrics) {
    const existing = db
      .select()
      .from(benchmarkFacts)
      .where(
        and(
          eq(benchmarkFacts.entityId, entityId),
          eq(benchmarkFacts.periodId, periodId),
          eq(benchmarkFacts.predicate, m.metric_key)
        )
      )
      .get();
    if (existing) continue;

    db.insert(benchmarkFacts)
      .values({
        entityId,
        periodId,
        subject: entityName,
        predicate: m.metric_key,
        object: String(m.value),
        evidenceSourceId: sourceId,
        confidence: m.confidence ?? 1.0,
        createdAt: new Date().toISOString(),
      })
      .run();
    derived++;
  }
  return derived;
}

function computeIndustryBaseline() {
  // 按 GICS Group × metric_key 聚合 median/p25/p75
  const rows = db
    .select({
      gicsGroup: benchmarkEntities.gicsGroup,
      metricKey: benchmarkMetrics.metricKey,
      value: benchmarkMetrics.metricValue,
    })
    .from(benchmarkMetrics)
    .leftJoin(
      benchmarkPeriods,
      eq(benchmarkMetrics.periodId, benchmarkPeriods.id)
    )
    .leftJoin(
      benchmarkEntities,
      eq(benchmarkPeriods.entityId, benchmarkEntities.id)
    )
    .all()
    .filter(r => r.gicsGroup && r.value != null);

  const groups: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    const g = r.gicsGroup as string;
    const k = r.metricKey as string;
    if (!groups[g]) groups[g] = {};
    if (!groups[g][k]) groups[g][k] = [];
    groups[g][k].push(r.value as number);
  }

  let computed = 0;
  for (const [gics, metrics] of Object.entries(groups)) {
    for (const [key, values] of Object.entries(metrics)) {
      values.sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)];
      const p25 = values[Math.floor(values.length * 0.25)];
      const p75 = values[Math.floor(values.length * 0.75)];

      // 幂等: delete old + insert
      db.delete(benchmarkIndustryBaseline)
        .where(
          and(
            eq(benchmarkIndustryBaseline.gicsGroup, gics),
            eq(benchmarkIndustryBaseline.periodType, "FY"),
            eq(benchmarkIndustryBaseline.metricKey, key)
          )
        )
        .run();

      db.insert(benchmarkIndustryBaseline)
        .values({
          gicsGroup: gics,
          periodType: "FY",
          metricKey: key,
          median,
          p25,
          p75,
          sampleSize: values.length,
          computedAt: new Date().toISOString(),
        })
        .run();
      computed++;
    }
  }
  return computed;
}

// ─── 主入口 ───
const archiveDir =
  process.argv[2] || process.env.BENCHMARK_ARCHIVE_DIR || "./benchmark_archive";
const normDir = path.join(archiveDir, "normalized");

console.log(`[seed] 读取: ${normDir}`);
const records = loadNormalizedFiles(normDir);
console.log(`[seed] 找到 ${records.length} 个文件`);

let totalEntities = 0,
  totalPeriods = 0,
  totalMetrics = 0,
  totalFacts = 0;

for (const { file, data } of records) {
  console.log(`  ${file}...`);
  const entityId = upsertEntity(data.entity);
  totalEntities++;

  const periodId = upsertPeriod(entityId, data.period);
  totalPeriods++;

  const sourceId = upsertSource(entityId, periodId, data.source, data.standard);

  const n = upsertMetrics(periodId, sourceId, data.metrics);
  totalMetrics += n;

  const f = deriveFacts(
    entityId,
    data.entity.name,
    periodId,
    sourceId,
    data.metrics
  );
  totalFacts += f;
}

// 计算行业基线
const baselineCount = computeIndustryBaseline();
console.log(
  `\n[seed] 完成: ${totalEntities}实体 ${totalPeriods}周期 ${totalMetrics}指标 ${totalFacts}事实 ${baselineCount}基线`
);
