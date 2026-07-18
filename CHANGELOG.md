# CHANGELOG

> 说明：`docs/CHANGELOG.md`（内容冻结于 v2.13）已删除，其有效历史并入本文件（v2.8 及以后条目）；本文件为唯一变更日志。

## v3.8.1 (2026-07-18) — 工程规范修复：配置落地 + 死代码清理 + 文档据实
- 修复 husky 死配置：package.json 补 `"prepare": "husky"`，hooks 真正安装
- 修复 CI 必红：Lint 步骤 --max-warnings 230→218（与 .eslint-threshold / metric-guard 锁值一致）；新增 .npmrc（legacy-peer-deps=true）保证本地 npm ci 与 CI 行为一致
- 删除 lint-staged 死配置（无调用方，且内部 --max-warnings 0 / 全量 tsc+vitest 与 218 政策矛盾）；pre-commit 门禁以 `npm run check` 为准
- 删除 .eslintignore（flat config 下不生效），有效条目并入 eslint.config.js；新增 linterOptions.reportUnusedDisableDirectives: "error"
- 死代码清理：server/routers/system.ts（_core/systemRouter.ts 重复实现）、server/services/WorkspaceService.ts、Manus 模板残留（server/_core/oauth|sdk|map|imageGeneration|voiceTranscription|dataApi|heartbeat|validation|llm.ts、server/storage.ts、references/、prompts/、template.json、根目录截图 PNG、todo.md），均经全仓 grep 确认 0 引用
- lint 范围补 shared/（check/lint/CI 三处同步）
- package.json 加 engines.node >=20；新增 test:coverage 脚本（需先装 @vitest/coverage-v8）
- 文档据实：财务恒等式 13→10 条、单元测试 194→205、删除无法产出的"覆盖率 50%+"表述、表数量 34→31、项目结构与角色模型按代码现实重写；阈值"未抬高"表述更正为据实锁定史（306→196→225→218）
- 安全死代码：删除 `systemRouter.ts` 残留的 `deployFile` tRPC procedure（随 `/api/admin/deploy-file` REST 端点一并清除，全仓 grep 确认 0 调用方），连带移除仅其使用的 `systemOwnerProcedure`

## v4.3.0 (2026-07-18) — 安全加固 + 质量门升级（修复大会战定版，据实记录）
- Bot 回调验签：钉钉回调 HMAC-SHA256 验签 + 1 小时防重放窗口，生产未配置 secret 时 fail-closed 拒绝处理；企微明文模式生产禁用（强制 EncodingAESKey 加密模式）；`/切换` 项目前统一 `assertBotProjectAccess` 鉴权（server/lib/bot/callback.ts、wecom-crypto.ts、access.ts）
- 上传鉴权前置：`POST /api/upload` 先经 `uploadAuth` JWT 校验 + 按用户限流，再进 multer 解析（server/_core/index.ts）
- 财务 RBAC 收紧：财务路由统一 `permissionProcedure("finance.view"/"finance.edit")` + `requireProjectAccess` 租户隔离，导入/结转写审计日志（server/routers/finance.ts、financial-reports.ts）
- 限流双维度：登录失败按 `login:ip:*` + `login:acct:*` 双维度分别计数，新增按邮箱维度的发信限流 `checkEmailSendLimit`（防邮件炸弹）；修复旧实现预检误清失败计数的 bug（server/lib/rate-limit.ts）
- deploy-file 端点删除：`/api/admin/deploy-file` REST 端点与残留 `deployFile` tRPC procedure 一并清除（v3.8.1 已记，本版再次确认 0 调用方）
- accounting 事务同步修复（真 bug）：`createJournalEntry` 的 better-sqlite3 事务回调改为同步（原返回 Promise 必抛 "Transaction function cannot return a promise" 并回滚），事务内读统一走 `tx` 保证同一事务快照（server/db/accounting.ts）
- 测试基建改造：默认并行测试修复为每 worker 独立库（tests/finance/worker-setup.ts），`vitest run` 默认参数即全绿；332 passed / 0 failed / 3 skipped，todo 已清零（原 9 个 todo 全部落地或移除）
- Prettier 全量格式化：`client/src`、`server`、`shared`、`scripts`、`tests` 范围内 280 个文件统一格式化；`prettier --check` 加入 `npm run check` 质量门最前置，husky pre-commit 与 CI（新增 Format check 步骤）同步生效
- 依赖清理：移除死依赖 `lint-staged`（配置块已于 v3.8.1 删除，连带 33 个传递依赖共 34 包）；package-lock.json 同步刷新，`npm ci` 验证通过

## v3.8 (2026-07-18) — 工程卓越(一)：安全加固 + 可观测性 + 测试基建
- O1: request-id/trace-id 链路关联（request-context.ts + requestIdMiddleware + reqLogger + tRPC onError 带 requestId）
- O2: SQL 慢查询日志（connection.ts patch prepare，SLOW_QUERY_MS 默认 50）
- O3: AI Token 监控（ai-usage.ts 聚合 + /api/ai-usage 端点，仅 SYSTEM_OWNER）
- S1: 修复 CSRF — 会话 cookie sameSite none→lax
- S2: 补全安全头（referrerPolicy / COOP / Permissions-Policy / CORP；抽至 http-middlewares.ts）
- S3: index.ts 抽 createApp() 工厂，测试环境不自动 listen
- T1/T2/T3: 新增 3 个本地可跑测试（request-context / ai-usage / http-middleware 集成）
- 质量门实测真绿（tsc 0 / eslint ≤218 / vitest 205 passed 0 failed / 10 skipped / 9 todo；修复 V3.8 引入的 prepare Proxy 导致全部 DB 测试 Illegal invocation 的回归）

## v3.7 (2026-07-18) — 账号体系 / 资料页 / 收尾加固
- W1: 注册自建专属 workspace（消除硬编码 ws:1 与跨租户隔离回归）
- W3/W4/W5/W6: users 表加 displayName/avatarUrl/bio；updateProfile + uploadAvatar；个人信息页可编辑（显示名+简介+头像）；全局展示 displayName
- W7: 看板统计缓存写入侧失效（routers.ts 任务增改删后 invalidateCache）
- W8: 通知偏好真正落库（me 返回 notificationPrefs，Settings 开关调用 updateNotificationPrefs）
- W12: DB 索引加固（users.email / workspace_members / tasks / projects / notifications / audit_logs / closings）
- L1/L2/L4/C1/C3/P1: 找回密码页面、邮箱验证预备、listOnlineUsers PII 收敛、Ctrl+K 修 404、MobileTabBar 死链、真实导出
- 质量门实测真绿（tsc 0 / eslint ≤218 / vitest 194 passed 0 failed）

## v3.6-iam (2026-07-17)
- T1-T10 IAM/隐私/财务治理加固 (10项全部完成)
- P0: 添加成员死代码→用户搜索, 审计持久化, 财务最小权限
- P1: 角色标签统一, 财务四眼原则·关账复核, 改密码, 隐私自助
- P2: 隐私政策补全, 登录页忘记密码, 设置清理
- r2修复: CommandMenu反引号, 找回密码页面路由, MobileTabBar去死链
- r3修复: listOnlineUsers PII收敛, 真实导出, 邮箱验证预备, 命令面板增强

## v3.5 (2026-07-15)
- 企微机器人21条命令
- 文件分享+短链预览
- permissionProcedure RBAC 框架

## v3.4 (2026-07-10)
- 核心CRUD: 项目/任务/Kanban/文件
- 财务模块: 复式记账/预算/结转/四大报表/比率
- JWT认证+角色基础
