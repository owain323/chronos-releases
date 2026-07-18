// server/db/schema-benchmark.ts — Benchmark Intelligence Engine (v4.4)
// Entity→Period→Statement→Metric 分层, 前向兼容季度/TTM/Forecast
import {
  sqliteTable,
  integer,
  text,
  real,
  unique,
} from "drizzle-orm/sqlite-core";

// ═══ §2.2 主体表 — 取代扁平 Company ═══
export const benchmarkEntities = sqliteTable("benchmark_entities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // 标准名 "Apple Inc."
  ticker: text("ticker"), // AAPL
  market: text("market"), // 'A'|'H'|'US'|'ADR'
  gicsGroup: text("gics_group").notNull(), // GICS Industry Group
  gicsSub: text("gics_sub"), // GICS Sub-Industry
  createdAt: text("createdAt"),
});

// ═══ §2.3 周期表 — 取代 Year, 支持 Q/TTM/Forecast ═══
export const benchmarkPeriods = sqliteTable(
  "benchmark_periods",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityId: integer("entity_id").notNull(),
    periodType: text("period_type").notNull(), // 'FY'|'Q1'|'Q2'|'Q3'|'Q4'|'TTM'|'Forecast'
    fiscalYear: integer("fiscal_year").notNull(),
    label: text("label"), // '2024 FY'|'2024 Q1'|'TTM 2024-09'
    startDate: text("start_date"),
    endDate: text("end_date"),
    createdAt: text("createdAt"),
  },
  t => ({
    uniq: unique().on(t.entityId, t.periodType, t.fiscalYear, t.label),
  })
);

// ═══ §2.4 报表表 — BS/IS/CF 结构 ═══
export const benchmarkStatements = sqliteTable("benchmark_statements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodId: integer("period_id").notNull(),
  statementType: text("statement_type").notNull(), // 'BS'|'IS'|'CF'
  createdAt: text("createdAt"),
});

// ═══ §2.5 指标表 — 带 confidence + source 溯源 ═══
export const benchmarkMetrics = sqliteTable("benchmark_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  periodId: integer("period_id").notNull(),
  statementId: integer("statement_id"), // 可空, 部分指标不属单张表
  metricKey: text("metric_key").notNull(), // 'revenue'|'gross_margin'|'roe'|...
  metricValue: real("metric_value"), // NULL=缺失(前端标灰)
  unit: text("unit").default("USD_millions"),
  confidence: real("confidence").default(1.0), // 0-1, 评审问题六
  sourceId: integer("source_id"),
  createdAt: text("createdAt"),
});

// ═══ §2.6 来源表 — 每条记录溯源, 合规必填 ═══
export const benchmarkSources = sqliteTable("benchmark_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: integer("entity_id"),
  periodId: integer("period_id"),
  sourceUrl: text("source_url").notNull(), // 合规必填
  licenseNote: text("license_note").notNull(), // 合规必填
  standard: text("standard"), // 'US_GAAP'|'IFRS'|'CAS'
  importedBy: text("imported_by"),
  version: integer("version").default(1),
  superseded: integer("superseded").default(0),
  createdAt: text("createdAt"),
});

// ═══ §2.7 指标关系表 — Financial Graph 基础 ═══
export const benchmarkMetricRelations = sqliteTable(
  "benchmark_metric_relations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromMetric: text("from_metric").notNull(), // 'revenue'
    toMetric: text("to_metric").notNull(), // 'gross_margin'
    relation: text("relation").notNull(), // 'depends_on'|'affected_by'|'drives'
    direction: text("direction"), // 'up'|'down'|'neutral'
    createdAt: text("createdAt"),
  }
);

// ═══ §2.8 财务本体表 — 多语言/别名 ═══
export const benchmarkOntology = sqliteTable("benchmark_ontology", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  canonical: text("canonical").notNull(), // 'revenue'
  alias: text("alias").notNull(), // '营业收入'|'Net Sales'
  lang: text("lang"), // 'en'|'zh'
  createdAt: text("createdAt"),
});

// ═══ §2.9 行业基线表 — 对标价值跃升 ═══
export const benchmarkIndustryBaseline = sqliteTable(
  "benchmark_industry_baseline",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gicsGroup: text("gics_group").notNull(),
    periodType: text("period_type").notNull(), // 'FY'
    metricKey: text("metric_key").notNull(),
    median: real("median"),
    p25: real("p25"),
    p75: real("p75"),
    top10pct: real("top10pct"), // 阶段2填充
    top25pct: real("top25pct"), // 阶段2填充
    sampleSize: integer("sample_size"),
    computedAt: text("computed_at"),
  }
);

// ═══ §2.10 事实层表 — Knowledge Layer 基础 ═══
export const benchmarkFacts = sqliteTable("benchmark_facts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: integer("entity_id"),
  periodId: integer("period_id"),
  subject: text("subject").notNull(), // 'Apple'
  predicate: text("predicate").notNull(), // 'revenue'
  object: text("object").notNull(), // '394B'
  evidenceSourceId: integer("evidence_source_id"),
  confidence: real("confidence").default(1.0),
  createdAt: text("createdAt"),
});
