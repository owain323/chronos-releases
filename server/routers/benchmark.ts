// server/routers/benchmark.ts — Benchmark Intelligence Engine API (v4.4 WO-BE-3)
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  publicProcedure,
  protectedProcedure,
  workspaceProcedure,
} from "../_core/trpc";
import { db } from "../db/connection";
import { eq, and, like, sql, desc, inArray } from "drizzle-orm";
import {
  benchmarkEntities,
  benchmarkPeriods,
  benchmarkStatements,
  benchmarkMetrics,
  benchmarkSources,
  benchmarkMetricRelations,
  benchmarkOntology,
  benchmarkIndustryBaseline,
  benchmarkFacts,
} from "../db/schema-benchmark";

// ─── 只读 guard: benchmark workspace 禁止写 ───
async function assertNotBenchmarkWorkspace(workspaceId: number) {
  const { workspaces } = await import("../../drizzle/schema");
  const ws = db
    .select({ type: workspaces.type })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();
  if (ws?.type === "benchmark") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "标杆工作区为只读，不支持写操作",
    });
  }
}

export const benchmarkRouter = router({
  // ─── 列表 ───
  listEntities: workspaceProcedure
    .input(
      z.object({
        search: z.string().optional(),
        industry: z.string().optional(),
        market: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.search)
        conditions.push(like(benchmarkEntities.name, `%${input.search}%`));
      if (input.industry)
        conditions.push(eq(benchmarkEntities.gicsGroup, input.industry));
      if (input.market)
        conditions.push(eq(benchmarkEntities.market, input.market));
      return db
        .select()
        .from(benchmarkEntities)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(benchmarkEntities.name)
        .all();
    }),

  // ─── 单实体详情 ───
  getEntity: workspaceProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const entity = db
        .select()
        .from(benchmarkEntities)
        .where(eq(benchmarkEntities.id, input.id))
        .get();
      if (!entity)
        throw new TRPCError({ code: "NOT_FOUND", message: "实体不存在" });
      const periods = db
        .select()
        .from(benchmarkPeriods)
        .where(eq(benchmarkPeriods.entityId, input.id))
        .orderBy(desc(benchmarkPeriods.fiscalYear), benchmarkPeriods.periodType)
        .all();
      return { ...entity, periods };
    }),

  // ─── 指标查询 ───
  listMetrics: workspaceProcedure
    .input(
      z.object({
        periodId: z.number(),
        metricKeys: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      const conditions = [eq(benchmarkMetrics.periodId, input.periodId)];
      if (input.metricKeys?.length) {
        conditions.push(inArray(benchmarkMetrics.metricKey, input.metricKeys));
      }
      return db
        .select()
        .from(benchmarkMetrics)
        .where(and(...conditions))
        .all();
    }),

  // ─── 行业列表 ───
  listIndustries: workspaceProcedure.query(async () => {
    return db
      .selectDistinct({ gicsGroup: benchmarkEntities.gicsGroup })
      .from(benchmarkEntities)
      .orderBy(benchmarkEntities.gicsGroup)
      .all();
  }),

  // ─── 行业基线 ───
  getBaseline: workspaceProcedure
    .input(
      z.object({
        gicsGroup: z.string(),
        periodType: z.string().default("FY"),
        metricKey: z.string(),
      })
    )
    .query(async ({ input }) => {
      return db
        .select()
        .from(benchmarkIndustryBaseline)
        .where(
          and(
            eq(benchmarkIndustryBaseline.gicsGroup, input.gicsGroup),
            eq(benchmarkIndustryBaseline.periodType, input.periodType),
            eq(benchmarkIndustryBaseline.metricKey, input.metricKey)
          )
        )
        .get();
    }),

  // ─── 对标 ───
  compare: workspaceProcedure
    .input(
      z.object({
        periodId: z.number(),
        projectId: z.number(),
      })
    )
    .query(async ({ input }) => {
      // 查行业基线
      const metrics = db
        .select()
        .from(benchmarkMetrics)
        .where(eq(benchmarkMetrics.periodId, input.periodId))
        .all();
      if (!metrics.length)
        return { metrics: [], baseline: null, anomalies: [] };

      // 拿第一个 metric 的 entity → gics → baseline
      const period = db
        .select()
        .from(benchmarkPeriods)
        .where(eq(benchmarkPeriods.id, input.periodId))
        .get();
      const entity = period
        ? db
            .select()
            .from(benchmarkEntities)
            .where(eq(benchmarkEntities.id, period.entityId))
            .get()
        : null;
      const baselines = entity
        ? db
            .select()
            .from(benchmarkIndustryBaseline)
            .where(
              and(
                eq(benchmarkIndustryBaseline.gicsGroup, entity.gicsGroup),
                eq(benchmarkIndustryBaseline.periodType, "FY")
              )
            )
            .all()
        : [];

      return { metrics, baselines, anomalies: [] };
    }),

  // ─── 指标关系图 ───
  getMetricGraph: workspaceProcedure
    .input(z.object({ metricKey: z.string() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(benchmarkMetricRelations)
        .where(eq(benchmarkMetricRelations.fromMetric, input.metricKey))
        .all();
    }),
});
