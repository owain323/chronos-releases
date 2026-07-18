// v2.11 SQL Benchmark: getFinanceSummary JS vs SQL
// Usage: node scripts/benchmark.mjs
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname + "/..";
const DB_PATH = ROOT + "/chronos.db";

async function init() {
  // Copy test DB
  if (fs.existsSync(DB_PATH + ".bak")) {
    fs.copyFileSync(DB_PATH + ".bak", DB_PATH);
  }
  // Init DB if not exists
  execSync("node scripts/init-db.mjs", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "file:" + DB_PATH },
    stdio: "pipe",
  });
}

async function seed(count) {
  // Use the existing seed or create test data
  const db = require(ROOT + "/server/db");
  const now = new Date().toISOString();
  console.log(`  Seeding ${count} records...`);
  for (let i = 0; i < count; i++) {
    await db.createCostEntry({
      projectId: 1,
      name: `Benchmark cost ${i}`,
      amount: String(Math.floor(Math.random() * 10000) / 100),
      category: ["材料", "人工", "设备", "运输"][i % 4],
      createdBy: 1,
    });
    await db.createRevenueEntry({
      projectId: 1,
      name: `Benchmark rev ${i}`,
      amount: String(Math.floor(Math.random() * 50000) / 100),
      category: ["销售", "服务", "咨询"][i % 3],
      createdBy: 1,
    });
    await db.createExpenseEntry({
      projectId: 1,
      name: `Benchmark exp ${i}`,
      amount: String(Math.floor(Math.random() * 5000) / 100),
      category: ["办公", "差旅", "营销"][i % 3],
      createdBy: 1,
    });
  }
}

async function benchmark(label, fn) {
  const start = process.hrtime.bigint();
  const memBefore = process.memoryUsage().heapUsed;
  const result = await fn();
  const memAfter = process.memoryUsage().heapUsed;
  const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;
  console.log(
    `  ${label}: ${elapsed.toFixed(1)}ms · memory: +${((memAfter - memBefore) / 1024 / 1024).toFixed(1)}MB`
  );
  return { elapsed, memDelta: memAfter - memBefore };
}

(async () => {
  const { getFinanceSummary } = require("../server/db/finance");

  console.log("=== CHRONOS v2.11 · SQL Benchmark ===\n");
  console.log("DB: SQLite (via better-sqlite3/Drizzle)");

  for (const count of [100, 1000, 10000]) {
    console.log(`\n--- ${count} records ---`);
    await init();
    // await seed(count);

    // JS mode
    process.env.USE_SQL_AGGREGATION = "false";
    const js = await benchmark("JS reduce", () => getFinanceSummary(1));

    // SQL mode
    process.env.USE_SQL_AGGREGATION = "true";
    const sql = await benchmark("SQL GROUP BY", () => getFinanceSummary(1));

    const speedup = js.elapsed / sql.elapsed;
    console.log(`  Speedup: ${speedup.toFixed(1)}x`);
    console.log(
      `  Memory saving: ${((js.memDelta - sql.memDelta) / 1024 / 1024).toFixed(1)}MB`
    );
  }

  console.log("\n✅ Benchmark complete");
})().catch(e => {
  console.error(e);
  process.exit(1);
});
