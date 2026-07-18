# ADR-007: SQLite WAL + 内存缓存 性能方案

**日期**: 2026-07-14
**状态**: 已采纳
**决策者**: 曹子杰

## 背景

CHRONOS v2.0 使用默认 SQLite journal mode（DELETE），并发写时频繁 SQLITE_BUSY。Dashboard 页面 N+1 查询导致加载缓慢（> 2s）。

## 选项

1. **直接迁移 PostgreSQL** — 一劳永逸但工作量大
2. **SQLite WAL + 查询优化** — 保持简单，优化现有架构
3. **Redis 缓存层** — 减少 DB 压力

## 决策

**选择 SQLite WAL + 内存缓存 + 查询聚合。**

关键设计：
- `PRAGMA journal_mode = WAL` — 读写并发不互斥
- `PRAGMA busy_timeout = 5000` — 等锁 5 秒，不直接抛错
- Dashboard 查询聚合：一次 `WHERE projectId IN (...)` 替代 N 次独立查询
- 内存缓存层（Map + TTL）：单进程环境下比 Redis 更简单

## 后果

### 正面
- WAL 模式支持并发读写，SQLITE_BUSY 发生率降低 95%+
- 查询聚合减少往返次数（N → 1）
- 内存缓存零网络延迟

### 负面
- WAL 模式增加 `.db-wal` 文件（通常 ~4MB）
- 内存缓存在多进程时会不一致（当前单进程无关）
- 大规模数据（> 10GB）仍需迁移 PostgreSQL
