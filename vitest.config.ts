import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // tsx 组件测试（client/src/**/*.test.tsx）需要 JSX automatic 转换
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    globalSetup: ["./vitest.global-setup.ts"],
    // P0 修复: 每 worker 独立 SQLite 库 (test-db-${VITEST_POOL_ID}.db)
    // setupFiles 先于任何测试文件执行, 在 server/config 读取 env 之前
    // 按 worker 设置 DATABASE_URL 并幂等初始化 schema —— 默认并行不再共享
    // 同一物理库文件, 消除 WAL 锁竞争 (database is locked / flaky)。
    setupFiles: ["./tests/finance/worker-setup.ts"],
    environment: "node",
    environmentMatchGlobs: [
      ["client/src/**", "jsdom"],
    ],
    env: {
      JWT_SECRET: "test-jwt-secret-for-testing-only-minimum-32-chars",
      // 注意: 不再在此硬编码 DATABASE_URL=file:./chronos.db。
      // 每个 worker 的 DATABASE_URL 由 tests/finance/worker-setup.ts 设置为
      // file:./test-db-${VITEST_POOL_ID}.db, 测试绝不读写仓库根的活体业务库。
      NODE_ENV: "test",
    },
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/**/*.test.ts",
      "client/src/**/*.test.tsx",
      "client/src/**/*.spec.ts",
      "tests/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/**/*.test.ts", "server/**/*.spec.ts", "node_modules"],
      // 阈值已移除: @vitest/coverage-v8 未安装, 配置 thresholds 会在
      // --coverage 时直接报错。待 package.json 补装 @vitest/coverage-v8 后
      // 恢复: thresholds: { lines: 60, branches: 50 } (逐步逼近 80/60)。
    },
  },
});
