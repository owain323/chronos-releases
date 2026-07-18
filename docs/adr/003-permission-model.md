# ADR-003: 权限模型 — 双层隔离 (Workspace + Project)

**日期**: 2026-07-15  
**状态**: 已采纳  
**决策者**: 曹子杰

## 背景

CHRONOS v3.0 存在 IDOR 漏洞：攻击者可通过修改 URL 中的 entity ID 访问其他 workspace/project 的数据。

## 决策

**双层权限模型：Workspace 隔离 + Project 访问控制。**

```
Request → context.ts (token → user + workspaceId)
              ↓
         protectedProcedure (ctx.user required)
              ↓
    ┌────────┴────────┐
    ↓                  ↓
requireProjectAccess  requireEntityAccess
(workspace member?)   (resolve entity → project → workspace)
```

关键设计：
1. `requireEntityAccess(entityType, entityId, userId)` — 统一入口
2. `requireProjectAccess(userId, projectId)` — 项目级
3. `requireSystemAccess(userId, SYSTEM_OWNER|SYSTEM_AUDITOR)` — 系统级
4. `systemRole` 与 `workspaceRole` 分离
5. 所有 mutation 自动记录到 activity_events (tRPC middleware)

## 后果

### 正面
- 彻底消除 IDOR（6 个 HIGH→0）
- 统一权限抽象 (project-guard.ts)
- 审计不可绕过

### 负面
- 每个新端点必须手动添加权限检查（约 26 个端点已补）
- entityType 白名单需要维护
