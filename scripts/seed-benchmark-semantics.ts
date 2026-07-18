// scripts/seed-benchmark-semantics.ts — 语义种子 (v4.4 WO-BE-4)
// 填充 metrics_relations + ontology 基础数据，为阶段3 LLM 铺路
// 用法: npx tsx scripts/seed-benchmark-semantics.ts

import { db } from "../server/db/connection";
import {
  benchmarkMetricRelations,
  benchmarkOntology,
} from "../server/db/schema-benchmark";

// ─── 财务指标关系链 ───
const RELATIONS = [
  {
    fromMetric: "revenue",
    toMetric: "gross_margin",
    relation: "drives",
    direction: "up",
  },
  {
    fromMetric: "revenue",
    toMetric: "operating_margin",
    relation: "drives",
    direction: "up",
  },
  {
    fromMetric: "gross_margin",
    toMetric: "operating_margin",
    relation: "depends_on",
    direction: "up",
  },
  {
    fromMetric: "operating_margin",
    toMetric: "net_margin",
    relation: "depends_on",
    direction: "up",
  },
  {
    fromMetric: "net_margin",
    toMetric: "roe",
    relation: "drives",
    direction: "up",
  },
  {
    fromMetric: "net_margin",
    toMetric: "roic",
    relation: "drives",
    direction: "up",
  },
  {
    fromMetric: "revenue",
    toMetric: "net_margin",
    relation: "drives",
    direction: "up",
  },
  {
    fromMetric: "gross_margin",
    toMetric: "net_margin",
    relation: "affected_by",
    direction: "up",
  },
];

// ─── 财务本体别名 (中英文) ───
const ONTOLOGY = [
  { canonical: "revenue", alias: "营业收入", lang: "zh" },
  { canonical: "revenue", alias: "主营业务收入", lang: "zh" },
  { canonical: "revenue", alias: "Net Sales", lang: "en" },
  { canonical: "revenue", alias: "Sales", lang: "en" },
  { canonical: "gross_margin", alias: "毛利率", lang: "zh" },
  { canonical: "gross_margin", alias: "Gross Profit Margin", lang: "en" },
  { canonical: "operating_margin", alias: "营业利润率", lang: "zh" },
  { canonical: "net_margin", alias: "净利率", lang: "zh" },
  { canonical: "net_margin", alias: "Net Profit Margin", lang: "en" },
  { canonical: "net_income", alias: "净利润", lang: "zh" },
  { canonical: "net_income", alias: "Net Income", lang: "en" },
  { canonical: "roe", alias: "净资产收益率", lang: "zh" },
  { canonical: "roe", alias: "Return on Equity", lang: "en" },
  { canonical: "roic", alias: "投入资本回报率", lang: "zh" },
  { canonical: "roic", alias: "Return on Invested Capital", lang: "en" },
  { canonical: "arr", alias: "年度经常性收入", lang: "zh" },
  { canonical: "arr", alias: "Annual Recurring Revenue", lang: "en" },
  { canonical: "nrr", alias: "净收入留存率", lang: "zh" },
  { canonical: "sssg", alias: "同店销售增长率", lang: "zh" },
  { canonical: "nim", alias: "净息差", lang: "zh" },
];

// ─── 幂等插入 ───
console.log("[seed] 插入指标关系...");
const existingRel = db.select().from(benchmarkMetricRelations).all();
if (existingRel.length === 0) {
  for (const r of RELATIONS) {
    db.insert(benchmarkMetricRelations).values(r).run();
  }
  console.log(`  插入 ${RELATIONS.length} 条关系`);
} else {
  console.log(`  已有 ${existingRel.length} 条, 跳过`);
}

console.log("[seed] 插入本体别名...");
const existingOnt = db.select().from(benchmarkOntology).all();
if (existingOnt.length === 0) {
  for (const o of ONTOLOGY) {
    db.insert(benchmarkOntology).values(o).run();
  }
  console.log(`  插入 ${ONTOLOGY.length} 条别名`);
} else {
  console.log(`  已有 ${existingOnt.length} 条, 跳过`);
}

console.log("[seed] 语义种子完成 ✅");
