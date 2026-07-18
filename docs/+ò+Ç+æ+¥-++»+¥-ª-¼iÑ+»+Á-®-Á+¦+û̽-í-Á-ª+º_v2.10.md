# CHRONOS 工程纪律与教训汇（v2.10 结项）

> 这不是报告，是约束。违反其中任何一条，你就是在这份文档面前丢了脸。
> 生成: 2026-07-15 · 来源: 老师审计 + Kimi审计 + 自审 51→82 全程

## 一、硬规则（已写进代码）

| # | 规则 | 执行机制 | 文件 |
|---|------|----------|------|
| 1 | ESLint 阈值 306 — 只降不升 | CI + husky | `.eslint-threshold` |
| 2 | 只改阈值不改源码 → 拒绝提交 | pre-commit | `.husky/pre-commit` |
| 3 | `it.todo()` 上限 8 — 新增必须同时兑现 | pre-commit | `scripts/metric-guard.cjs` |
| 4 | 测试不能是 `expect(true).toBe(true)` — 占位符不算测试 | code review | — |
| 5 | 前端测试不能是空壳 — 必须有 `@testing-library/react` 渲染 | code review | — |

## 二、审计教训（修过的坑，不能再踩）

### 安全类
| 教训 | 具体案例 | 怎么防 |
|------|---------|--------|
| 用户上传的内容进 DOM 必须 sanize | `.docx` → `dangerouslySetInnerHTML` 无 DOMPurify | 所有 `__html` 必经 `DOMPurify.sanitize()` |
| PolicyEngine 返回 `REQUIRE_APPROVAL` 不等于 "放行" | confirm 路由直接执行了需审批的 action | 三个分支都要有处理: ALLOW/DENY/REQUIRE_APPROVAL |
| httpOnly cookie 的 secure 参数必须一致 | login 设 `secure: dynamic`, logout 清 `secure: true` → cookie 清不掉 | clearCookie 参数与 setCookie 完全一致 |
| 限流要覆盖所有 auth 端点 | register/forgotPassword 无限流 → 可批量注册/邮箱轰炸 | 每个 auth 端点加 checkRateLimit + 成功 resetRateLimit |

### 权限类
| 教训 | 具体案例 | 怎么防 |
|------|---------|--------|
| `protectedProcedure` 只查登录，不查数据归属 | vendors/customers/files 的 list 全部裸奔 | 所有 project 级资源加 `requireProjectAccess` |
| workspace 操作要验成员身份 | invite/members/getById 任何人可操作任意 workspace | 加成员校验: `ms.find(m => m.userId === ctx.user.id)` |
| adminProcedure 要查 workspace 角色，不是全局 | 全局 admin 不一定是 workspace admin | 检查 `ctx.workspaceRole` 而非 `ctx.user.role` |
| 非项目成员的 fallback 不能是 viewer | project-guard 允许非成员只读 private 项目 | 直接 throw FORBIDDEN |

### 性能类
| 教训 | 具体案例 | 怎么防 |
|------|---------|--------|
| 永远别在 JS 里过滤 → SQL 做 | getProjectsByUserId `.all()` 后 `.filter()` | SQL WHERE + inArray |
| COUNT 别用 `.all().length` | getUnreadCount 全表加载 | `select({ count: sql\`count(*)\` }).where(read=false)` |
| 用户隔离放 SQL 层，不是 JS 层 | getAICostStats 无 userId → 泄露全局成本 | innerJoin + WHERE userId |
| 列表必须有分页 | 15+ 端点 `.all()` 无 limit | 默认 limit(50) |
| Map 必须有上界 | cache.ts 无界 → OOM | MAX_SIZE + interval 清理 |

### 代码质量类
| 教训 | 具体案例 | 怎么防 |
|------|---------|--------|
| 原子操作用 SQL，不要 read-modify-write | incrementTokenVersion 先查后改 → 竞态 | `sql\`tokenVersion + 1\`` |
| 空 catch {} 是最危险的代码 | 3 处空 catch → 登出失败静默、localStorage 读取静默 | 每个 catch 至少 `logger.error` |
| db 模块导入有 shadowing 风险 | `import * as db` 被内部 `const { db } = await import()` 遮蔽 | 优先用直接 import 具体函数 |
| any 不能泛滥 | 228 处 any → 类型检查形同虚设 | 渐近清: routers.ts 优先 → 前端组件 → DB 层 |

### 工程纪律类
| 教训 | 具体案例 | 怎么防 |
|------|---------|--------|
| 不要改阈值来通过 CI | ESLint 60→250→275→300→306 | metric-guard 硬锁 |
| 不要造空测试占位符 | auth.test.ts `expect(true).toBe(true)` | metric-guard 锁 it.todo 上限 |
| God File 拆分要读 DB 签名再写 | 5 个路由文件全 tsc error 后删除 | 先读 db/index.ts → 逐函数签名对齐 |
| 部署前服务端 schema 要先更新 | tokenVersion 漏部署 → "no such column" | 部署脚本加 `node scripts/init-db.mjs` |
| 源码包不要塞 .db 文件 | chronos.db.run 含 bcrypt hash | `.gitignore` 加 `*.db.run` |

## 三、项目文档清单

### 已存在 · 有效
| 文件 | 行数 | 内容 |
|------|------|------|
| `README.md` | ~120 | 项目介绍 + API + Quick Start |
| `LICENSE` | 21 | MIT |
| `CHANGELOG.md` | ~15 | v2.10 更新记录 |
| `docs/CHRONOS工作区体系设计文档.md` | 284 | Workspace 架构 |
| `docs/AI协作规范.md` | 311 | AI Agent 规范 |
| `docs/bot-architecture.md` | 123 | 企微 Bot 架构 |
| `CHRONOS产品化路线图_v14_合并版.html` | ~71K | 路线图 v14 含 Phase 8 |
| `CHRONOS_v2.10_修复总计划.md` | ~500 | Kimi审计后修复计划 |
| `scripts/metric-guard.cjs` | ~120 | 指标工程硬锁 |
| `drizzle/schema.ts` | ~600 | 表定义 + JSDoc |
| `server/services/ai/` | 5 文件 | JSDoc 全覆盖 |

### 不存在 · 需要创建
| 文件 | 用途 |
|------|------|
| `docs/testing-strategy.md` | 测试策略: 单元/集成/E2E 边界 |
| `docs/security-checklist.md` | 安全检查清单 (每次PR对照) |
| `docs/code-review-template.md` | PR 审查模板 |

### 过时 · 需要更新
| 文件 | 问题 |
|------|------|
| `HANDOVER.md` | 不存在 (报告提到过时) |
| `todo.md` | 大量已完成功能标未完成 |
| `shared/types.ts` | 空壳 7 行 |

## 四、纪律执行效果

```
修前: 51.1 (Kimi 审计)
修后: 预估 63+ (Week A+B 完成, Week C 部分)

实际改进 (非指标游戏):
  · 2 全表扫描 → SQL WHERE
  · 7 路由 +requireProjectAccess
  · 4 workspace 路由 +成员校验
  · DOMPurify × 3 文件 (XSS)
  · 3 空 catch → logger
  · graceful shutdown + cache LRU
  · PolicyEngine/LLMProvider 27 真实测试
  · 锁定阈值 306 (只降不升)

还债路线:
  Week C 剩余: C1 God File拆分 · C2 any清仓 · C8 AI Executor 7 action
  51 → 63 → 70+
```
