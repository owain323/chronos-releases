#!/bin/sh
set -e

# 迁移策略（修复: 生产不再使用 drizzle-kit push --force）:
#   push --force 会自动接受破坏性 schema 变更，且 drizzle-kit 是 devDependency，
#   生产镜像（npm ci --omit=dev）不含该 CLI。drizzle/ 已有版本化迁移
#   （meta/_journal.json + 0000_*.sql），由 init-db.mjs 内置的最小迁移执行器
#   按序应用，行为与 drizzle-kit migrate 等价。
#   后续 schema 变更: 改 drizzle/schema.ts → npx drizzle-kit generate → 提交
#   新生成的 drizzle/xxxx_*.sql → 部署时自动应用。
echo "[entrypoint] Running database migration..."
node scripts/init-db.mjs

echo "[entrypoint] Starting CHRONOS..."
exec node dist/index.js
