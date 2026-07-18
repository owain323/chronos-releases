# CHRONOS v4.4.0 — P1+P2 补强 + 审计全闭

打包日期: 2026-07-18
GitHub: github.com/owain323/CHRONOS
部署: chronos.owain32380.cn (Caddy+systemd)

## CI 实测状态 (以 npm run check 为准，2026-07-18 终验实测)

- `prettier --check`（client/src · server · shared · scripts · tests）: ✅ 全绿（已入 `npm run check` 质量门最前置，husky pre-commit 与 CI Format check 步骤同步生效）
- `tsc --noEmit`: ✅ 零错误
- `eslint --max-warnings 218`: ✅ 实测 184 warnings / 0 error（阈值锁定 218，锁定史见 `.eslint-threshold` 注释）
- `vitest run`（默认并行，不加参数）: ✅ 332 passed / 0 failed / 3 skipped（33 个测试文件；todo 已清零——原 9 个 todo 全部落地或移除；默认并行已修复为每 worker 独立库）
- `verify:finance`: ✅ 10 条会计恒等式全绿（断言数见 scripts/verify-financial-reports.ts）
- `vite build` / `npm run build`: ✅ 构建成功（xlsx 为独立异步 chunk；esbuild server 打包通过）

## v3.9.0 修复大会战（2026-07-18，终验定版）

> 方向：延续 v3.8 工程卓越路线，不引入新业务功能；本轮为安全加固收口 + 质量门升级 + 真 bug 修复。

### 安全加固（Security）

- Bot 回调验签：钉钉回调 HMAC-SHA256 验签 + 1 小时防重放窗口，生产未配置 secret 时 fail-closed；
  企微明文模式生产禁用（强制 EncodingAESKey）；`/切换` 项目前统一 `assertBotProjectAccess` 鉴权。
- 上传鉴权前置：`POST /api/upload` 先经 `uploadAuth` JWT 校验 + 按用户限流，再进 multer 解析。
- 财务 RBAC 收紧：财务路由统一 `permissionProcedure("finance.view"/"finance.edit")` + `requireProjectAccess`
  租户隔离，导入/结转写审计日志。
- 限流双维度：登录失败按 `login:ip:*` + `login:acct:*` 双维度计数；新增按邮箱的发信限流
  `checkEmailSendLimit`（防邮件炸弹）；修复预检误清失败计数的旧 bug。
- deploy-file 端点删除：`/api/admin/deploy-file` 与残留 `deployFile` tRPC procedure 一并清除，0 调用方。

### 真 bug 修复

- accounting 事务同步修复：`createJournalEntry` 的 better-sqlite3 事务回调原为 async（返回 Promise
  必抛 "Transaction function cannot return a promise" 并回滚），已改为同步；事务内读统一走 `tx`，
  保证读写处于同一事务快照（server/db/accounting.ts）。

### 测试基建（Testing）

- 默认并行修复：`vitest run` 默认参数即全绿，每 worker 独立库（tests/finance/worker-setup.ts），
  不再需要单线程兜底；332 passed / 0 failed / 3 skipped，todo 清零。
- 连续 3 次默认并行全绿且数字一致（终验实测）。

### 规范与依赖（Hygiene）

- Prettier 全量格式化：280 个文件统一风格（client/src · server · shared · scripts · tests）；
  `prettier --check` 入质量门最前置；修复 1 处格式化后 eslint-disable 指令位置失效
  （ProjectEditDialog.tsx，react-hooks/exhaustive-deps）。
- 依赖清理：移除死依赖 `lint-staged`（连带 33 个传递依赖共 34 包）；package-lock.json 刷新，
  `npm ci` 验证通过；未新增任何依赖（@vitest/coverage-v8 留待下轮）。

## v3.8 工程卓越（2026-07-18，主理人直改）

> 方向：聪明 AI 评审给 86/100，建议 v4.0 冻结功能只做 Engineering Excellence。
> V3.8 为第一部分：安全加固 + 可观测性 + 测试基建，仍不引入新业务功能。

### 可观测性（Observability）

- O1: request-id / trace-id 关联 — 新增 `server/lib/request-context.ts`(AsyncLocalStorage)；
  `http-middlewares.ts` 的 `requestIdMiddleware` 注入 `x-request-id` 响应头并透传；
  `context.ts` 透出 `requestId`；`logger.reqLogger()` 自动带 requestId；
  tRPC `onError` 现带 `requestId` 写 pino。日志可按请求链路聚合。
- O2: SQL 慢查询日志 — `server/db/connection.ts` patch `sqlite.prepare`，对 run/all/get/iterate 计时，
  `SLOW_QUERY_MS`(默认 50) 以上用 pino 打 `slow_query`。
- O3: AI Token 监控 — 新增 `server/lib/ai-usage.ts` 按模型内存聚合；`llm.invokeLLM` 成功后 `recordAiUsage`；
  新增 `/api/ai-usage`(仅 SYSTEM_OWNER) 暴露调用次数与 token 消耗。

### 安全加固（Security）

- S1: **修复 CSRF 漏洞** — `cookies.ts` 会话 cookie `sameSite: "none" → "lax"`。
  原 `none` 允许跨站 POST 携带 cookie（恶意站可触发 tRPC 变更），同域 Caddy 部署下 `lax` 即封堵且不影响同域使用。
- S2: 补全安全头 — `helmet` 新增 `referrerPolicy: strict-origin-when-cross-origin` 与
  `crossOriginOpenerPolicy: same-origin`；并追加 `Permissions-Policy`(禁 geolocation/mic/camera/payment/usb)
  与 `Cross-Origin-Resource-Policy: same-origin`。安全头逻辑抽至 `http-middlewares.ts` 便于单测。
- S3: 测试可启停 — `server/_core/index.ts` 抽 `createApp()` 工厂，测试环境(`NODE_ENV=test`)不再自动 `listen`，
  避免测试拉起监听端口；生产/开发保持自动启动。

### 测试基建（Testing）

- T1: 新增 `server/lib/request-context.test.ts`（AsyncLocalStorage 作用域）
- T2: 新增 `server/lib/ai-usage.test.ts`（token 聚合）
- T3: 新增 `tests/observability/http-middleware.test.ts`（mini-app 临时端口断言 x-request-id 与全部安全头，本地可跑无需 live server）

## v3.7 收尾修复（2026-07-18，主理人直改，本版继承）

- W7: 看板统计缓存写入侧失效 — `routers.ts` 在任务 create/updateColumn/update/delete 后调用 `invalidateCache("stats:")`
- W8: 通知偏好真正落库 — `me` 返回 `notificationPrefs`，Settings 通知开关调用 `updateNotificationPrefs`
- W12: DB 索引加固 — users.email / workspace_members(workspaceId,userId) / tasks(projectId,columnId) / projects.workspaceId / notifications(projectId,userId) / audit_logs.workspaceId / closings.projectId 加 `.index()`

## 继承自 v3.6-iam-final-r4（工程 AI 修复，已实测确认）

### 安全 / 隐私

- L4: `system.listOnlineUsers` 加 workspace 作用域，跨租户 email 脱敏（不再泄露他人邮箱）
- L1: 找回密码前端页 `ResetPasswordPage` + `/auth/reset-password` 路由（后端 forgotPassword/resetPassword 已存在）
- C1: CommandMenu 6 处双引号→反引号（Ctrl+K 不再 404）
- C3: MobileTabBar `/projects`→`/projects/new`、去重复 `/search`
- P1: 导出数据改用真实后端查询（含 projects/tasks/closings 计数）

### 账号 / 资料（A 模式）

- W1: 注册改为自建专属 workspace（不再硬编码 `workspaceId:1`，消除跨租户隔离测试回归）
- W3: users 表新增 `displayName` / `avatarUrl` / `bio` 列
- W4: 新增 `updateProfile` + `uploadAvatar`，头像存 `public/uploads/avatars/`
- W5: 个人信息页可编辑（显示名 + 简介 + 头像上传）
- W6: 全局展示 `displayName || name`
- L2: 注册增加 `emailVerified` 列与验证端点；密码强度 12 位含大小写数字

## 已知残余（移交下一轮精修，非阻塞）

- V2: `tests/migration/schema.test.ts` 仍 `describe.skip`（与 drizzle-kit push 冲突，CI 手动运行）
- W9: 工作区成员列表仍为只读（邀请走邮箱，改角色/移除待补）
- W11: 校验尚未统一到共享 zod 模块（注册/updateProfile 已用 zod，其余散落）

## 技术栈

React 19 · Tailwind CSS 4 · Express 4 · tRPC 11 · Drizzle ORM · SQLite
