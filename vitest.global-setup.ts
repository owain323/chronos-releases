// vitest globalSetup — 测试库生命周期管理
// P0 修复: 不再对共享的 chronos.db 跑 drizzle-kit push (并行 WAL 锁竞争根源)。
// schema 初始化下放给 per-worker setupFiles (tests/finance/worker-setup.ts),
// 这里只负责: 运行前清理上次中断残留的 test-db-*.db, 运行后统一清理。
// 绝不触碰仓库根的 chronos.db (活体业务库)。
import fs from "fs";
import path from "path";

const projectRoot = import.meta.dirname;
const TEST_DB_RE = /^test-db-\d+\.db(-wal|-shm|-journal)?$/;

function cleanupTestDbs() {
  let removed = 0;
  for (const f of fs.readdirSync(projectRoot)) {
    if (!TEST_DB_RE.test(f)) continue;
    try {
      fs.rmSync(path.join(projectRoot, f), { force: true });
      removed++;
    } catch {
      /* 文件被占用则留到下次清理 */
    }
  }
  return removed;
}

export function setup() {
  const removed = cleanupTestDbs();
  console.log(
    `[vitest-setup] per-worker 独立测试库模式 (test-db-\${VITEST_POOL_ID}.db), 清理残留 ${removed} 个`
  );
}

export function teardown() {
  const removed = cleanupTestDbs();
  if (removed > 0) {
    console.log(`[vitest-setup] teardown: 清理测试库文件 ${removed} 个`);
  }
}
