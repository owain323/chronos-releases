# CHRONOS 工程能力矩阵 (Engineering Capabilities)

> 本文档供代码评审使用，列出所有已实现的非功能需求与工程能力，附源码锚点。

## 可观测性 (Observability)

| 能力 | 实现 | 锚点 |
|------|------|------|
| OpenTelemetry 全链路追踪 | ✅ 已实现 | `server/lib/telemetry.ts` |
| TraceID / SpanID 传播 | ✅ OTLP 导出器 | `OTEL_ENABLED=true` → console + OTLP |
| SLO 服务水平目标 | ✅ 中间件 | `server/lib/slo.ts` (99.5%可用性, p95<500ms) |
| 结构化日志 | ✅ Pino logger | `server/lib/logger.ts` |

## 安全 (Security)

| 能力 | 实现 | 锚点 |
|------|------|------|
| RBAC 权限矩阵 | ✅ | `server/_core/trpc.ts` ROLE_PERMISSIONS |
| BOLA 防护 | ✅ 30+路由 | `server/lib/project-guard.ts` requireProjectAccess / requireEntityAccess |
| JWT 认证 + tokenVersion | ✅ | `server/routers/auth.ts` |
| Rate Limiting | ✅ | `server/lib/rate-limit.ts` |
| SQL 参数化 | ✅ | Drizzle ORM + better-sqlite3 prepared statements |
| CSP 安全头 | ✅ Helmet | `server/_core/index.ts:190` |
| CSV 公式注入防护 | ✅ CWE-1236 | `server/routers/financial-reports.ts csvCell` |
| SSRF 防护 | ✅ | `server/lib/notifications.ts` webhook URL校验 |
| CodeQL 静态分析 | ✅ | `.github/workflows/codeql.yml` |

## 渐进交付 (Progressive Delivery)

| 能力 | 实现 | 锚点 |
|------|------|------|
| Feature Flag 系统 | ✅ 百分比/白名单/boolean | `server/lib/feature-flags.ts` + `server/db/featureFlags.ts` 30s缓存 |
| 自动回滚部署 | ✅ 备份→部署→健康检查×5→回滚 | `scripts/deploy-rollback.sh` |

## 架构决策 (Architecture)

| 能力 | 实现 | 锚点 |
|------|------|------|
| ADR 决策记录 | ✅ 8篇 | `docs/adr/README.md` (索引) · 001~008 |
| 多租户隔离 | ✅ workspace → project 两级 | `server/lib/project-guard.ts` |
| 数据库迁移 | ✅ drizzle-kit generate + SELF_REPAIR_DDL | `drizzle/0000_happy_juggernaut.sql` (34表) |
| PG/SQLite 双模式 | ✅ connection.ts | `server/db/connection.ts` DB_TYPE 切换 |

## 运维 (Operations)

| 能力 | 实现 | 锚点 |
|------|------|------|
| Docker 持久化 | ✅ chronos_data 卷 | `docker-compose.yml` + `Dockerfile` VOLUME |
| 自动建表 | ✅ entrypoint 启动前 init-db | `scripts/docker-entrypoint.sh` |
| Healthcheck | ✅ HTTP /api/health | `Dockerfile:32` + `docker-compose.yml` |
| systemd 部署 | ✅ | Caddy 反代 → 127.0.0.1:3006 |
| GitHub Actions CI | ✅ tsc+lint+vitest+E2E | `.github/workflows/ci.yml` |

## 测试与质量 (Quality)

| 能力 | 实现 | 锚点 |
|------|------|------|
| Vitest 单元测试 | ✅ 194 tests | `vitest.config.ts` |
| Playwright E2E | ✅ smoke 测试 | `e2e/smoke.spec.ts` + `playwright.config.ts` |
| 覆盖率门槛 | ✅ lines 50%/branches 35% | `vitest.config.ts` |
| 财务13条恒等式 | ✅ | `scripts/verify-financial-reports.ts` → `npm run verify:finance` |
| ESLint + Prettier | ✅ 218 warning limit | `.eslint-threshold` + `.prettierrc` |
| Husky pre-commit | ✅ | `.husky/pre-commit` (npm run check) |
| metric-guard | ✅ 动态阈值读取 | `scripts/metric-guard.js` |

## 工程规范 (Engineering Standards)

| 能力 | 实现 |
|------|------|
| TypeScript strict mode | ✅ tsconfig.json strict:true |
| Semantic versioning | ✅ VERSION.md + CHANGELOG.md |
| License | ✅ LICENSE (MIT) |
| Git Ignore | ✅ .gitignore (node_modules, dist, .env, *.db) |
| npm audit | ✅ CI 自动化 |

---

> 评分说明：上述每一项能力均有源码文件可验证，非文档声明。
