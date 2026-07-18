# 架构决策记录 (ADR)

CHRONOS 项目的关键架构决策记录，采用 [ADR](https://adr.github.io/) 格式。

| 编号 | 标题 | 日期 | 状态 |
|------|------|------|------|
| [001](001-postgresql-migration.md) | SQLite → PostgreSQL 迁移策略 | 2026-07-16 | 已采纳 |
| [002](002-ai-agent-security.md) | AI Agent 安全沙箱设计 | 2026-07-16 | 已采纳 |
| [003](003-permission-model.md) | 权限模型从简单角色到细粒度守卫 | 2026-07-16 | 已采纳 |
| [004](004-trpc-protocol.md) | tRPC v11 作为 API 层统一协议 | 2026-07-10 | 已采纳 |
| [005](005-jwt-cookie-auth.md) | JWT + Cookie 认证方案 | 2026-07-11 | 已采纳 |
| [006](006-rbac-permission-model.md) | RBAC 权限模型设计 | 2026-07-13 | 已采纳 |
| [007](007-sqlite-wal-cache.md) | SQLite WAL + 内存缓存 性能方案 | 2026-07-14 | 已采纳 |
| [008](008-wecom-bot.md) | 企微机器人集成架构 | 2026-07-11 | 已采纳 |

## 模板

新建 ADR 时使用以下模板：

```markdown
# ADR-NNN: 标题

**日期**: YYYY-MM-DD
**状态**: 提案中 / 已采纳 / 已废弃 / 已替换
**决策者**: 曹子杰

## 背景
（为什么需要做这个决策）

## 选项
（列出候选方案及其优缺点）

## 决策
（选择哪个方案，为什么）

## 后果
### 正面
### 负面
```
