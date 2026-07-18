# ADR-006: RBAC 权限模型设计

**日期**: 2026-07-13
**状态**: 已采纳
**决策者**: 曹子杰

## 背景

CHRONOS 从单用户演进到多租户（multi-workspace），需要细粒度权限控制。初期简单的 `admin/user` 角色无法满足一个 workspace 内不同成员的不同权限需求。

## 选项

1. **ACL (Access Control List)** — 每个资源挂一个用户/权限列表
2. **RBAC (Role-Based Access Control)** — 角色 → 权限，用户 → 角色
3. **ABAC (Attribute-Based Access Control)** — 基于属性的策略引擎

## 决策

**选择 RBAC，理由是平衡灵活性和实现复杂度。**

关键设计：
- `permissions` 表：`(resource, action)` 对（如 `project:create`, `finance:view`）
- `role_permissions` 表：预置 4 个角色（`owner`, `admin`, `member`, `viewer`）
- `workspace_members` 表：每个用户在每个 workspace 有一个角色
- 三层守卫：
  1. `requireAuth` — 必须登录
  2. `requireProjectAccess` — 必须是项目成员
  3. `requireEntityAccess` — 必须是实体所有者或有权限

## 后果

### 正面
- 清晰的权限边界：三层守卫逐级收窄
- 可扩展：新增角色只需加 `role_permissions` 行
- 支持多 workspace 隔离

### 负面
- 三层守卫增加了 procedure 装饰器复杂度
- 不支持动态条件权限（如"只能看自己创建的任务"）
