# ADR-001: SQLite → PostgreSQL 迁移策略

**日期**: 2026-07-16  
**状态**: 已采纳  
**决策者**: 曹子杰

## 背景

CHRONOS v3.0 使用 SQLite (WAL 模式) 作为唯一数据库。随着功能增长（审计系统、多租户、AI Agent），SQLite 的并发限制和单文件架构成为瓶颈。

## 决策

**从 SQLite 迁移到 PostgreSQL 16，但保留 SQLite 作为开发/测试环境。**

关键设计：
1. `connection.ts` 通过 `DB_TYPE` env 自动切换数据库驱动
2. 使用 Drizzle ORM 统一查询 API，零业务代码改动
3. 迁移分三步：DDL 自动转换 → 全量数据迁移 → 生产切换

## 后果

### 正面
- 支持 500+ 并发用户（SQLite 上限 ~100）
- JSONB 支持 → activity_events.metadata 更强
- 主从复制 / 备份生态成熟
- docker-compose 一键部署

### 负面
- 增加运维复杂度（PG 进程管理）
- 开发环境增加依赖（需要 PG 或 SQLite 回退）
- drizzle-kit 方言不兼容（schema.ts 用 SQLite 语法，需手动 PG DDL）
