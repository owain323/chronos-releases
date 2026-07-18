# CHRONOS 交接文档

## 项目概览

- **项目名**: CHRONOS
- **技术栈**: React 19 + TypeScript + Express + tRPC 11 + Drizzle ORM + SQLite
- **部署**: chronos.owain32380.cn (腾讯云上海, Caddy + systemd)
- **环境**: Node 22, npm

## 快速启动

```bash
cp .env.example .env    # 填入 JWT_SECRET（≥32字符）
npm install --legacy-peer-deps
npm run dev             # 开发模式，端口 3006
```

## 项目结构

```
TaskNest/
├── client/src/         # React 前端
│   ├── pages/          # 页面组件 (Dashboard, TaskList, Bookkeeping...)
│   ├── components/     # 通用组件 (AuthGuard, KanbanBoard, TopNavBar...)
│   └── _core/          # hooks, trpc client, theme
├── server/             # 后端
│   ├── _core/          # Express 配置、trpc、env 校验、context
│   ├── db/             # 数据层 (projects, tasks, files, finance...)
│   ├── routers/        # tRPC 路由 (auth, search, routers.ts)
│   └── lib/bot/        # 企微机器人 (21条命令 + 加解密)
├── drizzle/            # Schema 定义
├── shared/             # 前后端共享 (常量、类型、错误)
└── scripts/            # 工具脚本 (备份、初始化、调试)
```

## 核心命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 |
| `npm run check` | tsc + eslint + vitest（提交前必须过） |
| `npm run build` | 前端构建 + 后端 esbuild |
| `npm start` | 生产模式启动 |

## 数据库

使用 SQLite + better-sqlite3。启用 WAL 模式和外键。

- 数据库文件: `chronos.db`
- Schema: `drizzle/schema.ts`
- 连接: `server/db/connection.ts`

## 认证

JWT + bcrypt。JWT_SECRET 生产环境需 ≥32 字符，开发环境任意值。

## 企微机器人

- 回调: `/api/bot/callback`（GET 验证 / POST 消息）
- 命令: `/帮助` 查看全部 21 条命令
- 配置: 企微后台 → 应用管理 → 机器人 → API 配置

## 部署

```bash
npm run build
scp -r dist/public/* root@101.35.234.57:/opt/CHRONOS/dist/public/
scp dist/index.js root@101.35.234.57:/opt/CHRONOS/dist/
ssh root@101.35.234.57 "systemctl restart chronos"
```

## 已知限制

- SQLite 单文件，并发写入瓶颈（Phase 2 计划迁移 Postgres）
- 当前多Workspace模式，已实现完整隔离(RBAC+requireProjectAccess+requireEntityAccess)（Phase 3）
- 无错误追踪/Sentry（Phase 5）
