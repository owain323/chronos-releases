# CHRONOS — 团队协作平台

项目任务管理、供应商/客户管理、成本与财务核算一体化应用。

## 技术栈

- **前端**: React 19 + Tailwind CSS v4 + shadcn/ui
- **后端**: Express + tRPC v11
- **数据库**: SQLite (better-sqlite3 + Drizzle ORM)
- **构建**: Vite + tsx

## 快速启动

> 环境要求：Node.js >= 20（package.json `engines` 已声明）。依赖版本以 `package-lock.json` 为准，安装请用 `npm ci`（仓库根目录 `.npmrc` 已配置 `legacy-peer-deps=true`）；个别安全敏感包钉死精确版本（如 `jose: 6.1.0`、`typescript: 5.9.3`），升级需走 code review。

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
node scripts/init-db.mjs

# 3. 启动开发服务器
npm run dev
```

启动后访问 http://localhost:3000

## 工程能力

详见 [docs/CAPABILITIES.md](docs/CAPABILITIES.md)（完整能力矩阵含源码锚点）

| 类别 | 已实现 |
|------|--------|
| **可观测** | OpenTelemetry 全链路追踪 · SLO 99.5% · 结构化日志 |
| **安全** | RBAC · BOLA 防护 30+路由 · CSP · SSRF · CSV 注入防护 · CodeQL 扫描 |
| **渐进交付** | Feature Flag (百分比/白名单) · 自动回滚部署 |
| **架构** | 8篇 ADR 决策记录 · 多租户隔离 · drizzle 迁移历史 31表 · PG/SQLite 双模式 |
| **运维** | Docker 卷持久化 · healthcheck · GitHub Actions CI · Playwright E2E |
| **质量** | 332 单元测试（3 skipped / 0 todo）· Prettier 格式门禁 · ESLint ≤218（实测 184）· Husky pre-commit · 财务 10 条恒等式验证 |

> 覆盖率：`test:coverage` 脚本已预留（`vitest run --coverage`），需先安装 `@vitest/coverage-v8` 方可产出，当前无实测覆盖率数据。

## 项目结构

```
client/          # React 前端
  src/
    components/  # UI 组件（含 shadcn/ui）
    pages/       # 页面路由
    contexts/    # React Context
    lib/         # 工具函数、tRPC 客户端
server/          # Express + tRPC 后端
  _core/         # 核心配置（context、trpc、env、cookies、系统路由、vite 接入）
  routers/       # tRPC 路由（CRUD + 搜索 + 财务 + AI）
  services/      # 业务服务层（Task/Project/Cost/Revenue/Permission/Email/Analytics/AI）
  db/            # Drizzle 查询模块（按领域拆分）+ connection.ts（SQLite 连接与慢查询补丁）
  lib/           # 基础设施（日志、审计、缓存、限流、安全头中间件、特征开关、可观测性、bot）
  types/         # 服务端类型定义
drizzle/         # Drizzle schema 定义与迁移
scripts/         # 数据库初始化、备份、metric-guard 等工具脚本
shared/          # 前后端共享（类型、常量、分页）
tests/           # 集成/迁移测试
e2e/             # Playwright E2E
```

## 认证与权限 (v2.8)

| 能力 | 状态 | 说明 |
|:--|:--:|:--|
| 邮箱注册/登录 | ✅ | bcrypt + JWT (7天过期) |
| 忘记密码/重置 | ✅ | JWT reset token (24h) + 邮件发送接口 |
| 账号软删除(GDPR) | ✅ | 清空个人信息，保留业务数据 |
| 多工作空间 | ✅ | workspace 完全数据隔离 |
| 项目级权限 | ✅ | projectMembers + requireProjectAccess 两层守卫 |
| 角色体系 | ✅ | 三层：users.role 全局列（默认 user）；工作区四角色 owner/admin/member/viewer（workspace_members.role + role_permissions 表）；系统级 SYSTEM_OWNER/SYSTEM_AUDITOR（system_roles 表）。JWT 仅携带 uid + tokenVersion，角色均查库判定 |
| 登录限流 | ✅ | 5次/15分钟/IP |
| audit_logs | ✅ | 财务操作/登录全量审计 |
| 企微 Bot 认证 | ✅ | 独立验证码绑定 + 4位分享码鉴权 |

审计日志覆盖 login、costs/revenues create/update/delete。bot 模块通过 `bot-bind.html` 独立认证页面 + 24h 过期分享码控制文件访问。

## 数据库初始化

`scripts/init-db.mjs` 创建所有表并预置默认管理员用户。数据库文件为项目根目录下的 `chronos.db`。
