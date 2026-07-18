# CHRONOS 工作区（组织）体系 · 完整设计文档
>
> **目的**：本文档供多 AI 审阅用，验证"租户-项目-数据"三层隔离模型的完整性。
> **版本**：2026-07-14 · 代码同步至 commit `a9a860d`
> **审阅重点**：数据模型是否闭环 / 权限是否存在漏洞 / 前端入口是否完备 / 待办是否明确

---

## 一、架构概览

```
┌─────────────────────────────────────────────────┐
│  租户层 (Workspace = Org)                        │
│  · 数据隔离最高边界                                │
│  · 每个用户可属于多个 Workspace                     │
│  · 切换 Workspace 即切换全部上下文                  │
├─────────────────────────────────────────────────┤
│  业务层 (Project)                                 │
│  · 挂载在 Workspace 下                            │
│  · visibility: "private" (强管控) | "org" (公开)   │
│  · 项目成员 = projectMembers 表                   │
├─────────────────────────────────────────────────┤
│  数据层 (Finance / Tasks / Files)                  │
│  · 成本/收入: 三层脱敏 (Viewer · Admin · Owner)     │
│  · 任务/文件: 按项目隔离                            │
│  · 审计日志: 所有修改操作强制落入 audit_logs         │
└─────────────────────────────────────────────────┘
```

### 关键原则

| # | 原则 | 落地位置 |
|---|------|---------|
| 1 | **数据不跨租户** | 所有查询用 `workspaceId` 过滤 |
| 2 | **权限绑在组织角色上** | `workspace_members.role` → FALLBACK_MAP |
| 3 | **项目可见性混合模式** | `projects.visibility` + `canAccessProject()` |
| 4 | **财务数据按角色脱敏** | `maskFinanceData()` 三层 |
| 5 | **操作有迹可循** | `audit_logs` 记录 who/when/what |

---

## 二、数据模型

### 2.1 核心关系 (ER)

```
users
  ├── workspace_members (多对多: user ↔ workspace)
  ├── projects (ownerId)
  ├── projectMembers (多对多: user ↔ project)
  └── tasks (assigneeId, creatorId)

workspaces
  ├── workspace_members
  └── projects (workspaceId)

projects
  ├── projectMembers
  ├── tasks (projectId)
  ├── costEntries (projectId)
  ├── revenueEntries (projectId)
  ├── expenseEntries (projectId)
  ├── vendors (projectId)
  ├── customers (projectId)
  ├── milestones (projectId)
  ├── fileSnapshots (projectId)
  ├── accounts (projectId)
  ├── journalEntries (projectId)
  └── webhooks (projectId)
```

### 2.2 关键表清单

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `users` | 全局唯一身份 | id, email, role, tokenVersion, passwordHash |
| `workspaces` | 组织/租户 | id, name, slug (unique), createdBy |
| `workspace_members` | 用户↔组织关联 | workspaceId, userId, role |
| `projects` | 项目 | id, workspaceId, ownerId, visibility, status |
| `projectMembers` | 项目成员 | projectId, userId, role, phone, notes |
| `tasks` | 任务 | projectId, columnId, assigneeId, priority |
| `costEntries` | 支出 | projectId, amount, category, vendorId |
| `revenueEntries` | 收入 | projectId, amount, category, customerId |
| `expenseEntries` | 运营费用 | projectId, amount, category |
| `permissions` | 权限定义 | resource, action |
| `role_permissions` | 角色↔权限 | role, permissionId |
| `audit_logs` | 审计日志 | userId, action, entity, entityId, changes |

### 2.3 当前未落地的字段

| 表 | 缺失字段 | 设计中的用途 |
|----|---------|------------|
| `projects` | 无 `locked` 字段 | 审批流—锁定项目需 Admin 审批 |
| `workspaces` | 无 `settings` JSON | 组织级配置（默认角色等） |
| `workspace_members` | 无 `invitedBy` | 邀请链路追踪 |
| `costEntries` | 无 `approvalStatus` | 审批状态 |
| `vendors` | 无 `workspaceId` | 供应商是否能跨项目共享？|

---

## 三、权限模型

### 3.1 角色体系（4 级）

| 角色 | 权限范围 | 来源 |
|------|---------|------|
| **owner** | `*`（全部） | 用户创建 Workspace 时自动获得 |
| **admin** | `project.* task.* finance.* member.invite` | 手动指定 |
| **member** | `project.read task.create/read/update finance.view` | 默认加入角色 |
| **viewer** | `project.read task.read finance.view` | 仅查看 |

**实现位置**：`server/services/PermissionService.ts` → `FALLBACK_MAP`

### 3.2 权限检查链路

```
请求 → tRPC middleware (protectedProcedure)
     → ctx.user (从 JWT token 解析)
     → permissionProcedure("finance.edit")
        └→ hasPermission(userId, workspaceId, "finance.edit")
           └→ 查 workspace_members.role
           └→ 查 FALLBACK_MAP[role] (或 role_permissions 表)
           └→ 返回 true/false
```

### 3.3 项目访问控制（混合模式）

```typescript
// server/services/PermissionService.ts · canAccessProject()
//
// 规则优先级:
//   1. Owner/Admin → 永远可见
//   2. visibility === "org" → 组织内所有成员可见
//   3. 是项目 Owner 或项目成员 → 可见
//   4. 否则 → 拒绝
```

### 3.4 财务数据脱敏（三层）

| 层级 | 可见角色 | 内容 |
|------|---------|------|
| Tier 1 公开 | viewer+ | name, category, date, notes |
| Tier 2 敏感 | admin+ | amount（金额）, vendorName, customerName |
| Tier 3 审计 | owner | approvalStatus, auditNote |

**实现位置**：`maskFinanceData()` 已接入 `costs.getByProject` 和 `revenues.getByProject`

### 3.5 当前权限缺口

| 缺口 | 风险 | 优先级 |
|------|------|--------|
| **workspaceId 未写入 JWT token** | 前端切换 Workspace 后，后端仍用旧 ctx | 🔴 P0 |
| **projectMembers 表存在但路由未走** | project.create 不写 projectMembers，默认无人能访问私有项目 | 🔴 P0 |
| **成员邀请未接 EmailService** | 点了邀请但没人收到通知 | 🟡 P1 |
| **离职继承未实现** | member 离职后私有项目成数据孤岛 | 🟡 P1 |
| **审批流未实现** | 无 locked 状态/审批机制 | 🔵 P2 |

---

## 四、API 设计

### 4.1 Workspace 路由

| 方法 | 路由 | 输入 | 鉴权 | 返回 |
|------|------|------|------|------|
| QUERY | `workspaces.list` | void | protected | Workspace[] |
| MUTATION | `workspaces.create` | {name, slug?} | protected | Workspace |
| QUERY | `workspaces.members` | {workspaceId} | protected | Member[] |
| MUTATION | `workspaces.invite` | {workspaceId, userId} | protected | result |
| MUTATION | `workspaces.switch` | {workspaceId} | protected | {token} |

### 4.2 Project 路由

| 方法 | 路由 | 关键字段 |
|------|------|---------|
| QUERY | `projects.list` | → 按 ctx.workspaceId 过滤（TODO） |
| QUERY | `projects.getById` | |
| MUTATION | `projects.create` | {name, description, visibility?} |
| MUTATION | `projects.update` | |
| MUTATION | `projects.delete` | |

### 4.3 未接入的 API

| 路由 | 现状 |
|------|------|
| `shared/pagination.ts` | 工具函数存在，无路由调用 |
| `project.members` 管理 | `projectMembers` 表有，CRUD 路由缺 |
| `workspace.settings` | 无此路由 |

---

## 五、前端实现

### 5.1 组件清单

| 组件 | 文件 | 技术栈 |
|------|------|--------|
| WorkspaceSwitcher | `client/src/components/workspace/WorkspaceSwitcher.tsx` | DropdownMenu |
| NewWorkspaceDialog | `client/src/components/workspace/NewWorkspaceDialog.tsx` | Dialog + Form |
| useCurrentWorkspace | `client/src/hooks/useCurrentWorkspace.ts` | localStorage + tRPC |
| ChronosLayout (Sidebar) | `client/src/components/ChronosLayout.tsx` | Sheet + 固定侧栏 |
| TopNavBar | `client/src/components/TopNavBar.tsx` | 搜索 + 通知 |

### 5.2 页面入口

| 页面 | 路由 | 入口 |
|------|------|------|
| 仪表板 | `/` 或 `/dashboard` | Sidebar"仪表板" |
| 组织管理 | `/workspaces` | Sidebar"组织管理" + WorkspaceSwitcher"管理组织" |
| 项目详情 | `/projects/:projectId` | Sidebar 项目列表 |
| 设置 | `/settings` | Sidebar 底部 |

### 5.3 前端设计语言

- **组件库**：shadcn/ui (Card, Button, Dialog, DropdownMenu, Tabs, Skeleton, Input, Label, Badge)
- **颜色**：Tailwind CSS — 主色 sky-600/500, 中性 gray-100~900
- **三态**：所有数据组件支持 loading (Skeleton), empty (EmptyState), error (toast)
- **响应式**：桌面固定侧栏 250px + 手机 Sheet 推拉

---

## 六、决策记录

### 6.1 已验证的设计选择

| 决策 | 选择 | 理由 |
|------|------|------|
| 租户隔离层级 | Workspace → Project → Data | 最自然映射"公司→部门→数据" |
| 角色粒度 | 4 级 (owner/admin/member/viewer) | 平衡复杂度和灵活度 |
| 项目可见性 | 混合模式 (private 默认 + org 可选) | 用户要求：强管控为主 + 策略性公开 |
| 财务脱敏 | 三层 (公开/敏感/审计) | 用户要求：基于字段敏感度分级 |
| JWT 认证 | tokenVersion 机制 | 防止 token 泄露后无法撤销 |
| 密码安全 | bcrypt + 统一错误消息 | 防用户枚举 |

### 6.2 待决策项

| 议题 | 选项 A | 选项 B | 建议 |
|------|--------|--------|------|
| **Workspace 创建后的默认行为** | 只有创建者 | 创建者 + 可选初始成员 | 选项 A（简单起）→ 后续加邀请 |
| **供应商/客户可否跨项目共享** | 仅项目内 | 组织内共享 | 待业务场景验证 |
| **项目删除策略** | 软删除 | 硬删除 + 审计 | 硬删除 + 审计日志 |

---

## 七、已知问题 & 待办

### 🔴 P0 — 功能阻断

1. **JWT token 不含 workspaceId** → 切换 Workspace 后后端不知道当前组织，安全漏洞
2. **project.create 不自动添加创建者为 projectMember** → 创建者自己看不到自己创建的私有项目

### 🟡 P1 — 功能残缺

3. **成员邀请链路为空** → 邮箱输入了，没有 sendEmail 调用
4. **离职继承缺失** → 成员离开后项目无法恢复
5. **pagination.ts 未接入** → 列表无限拉取

### 🔵 P2 — 体验优化

6. **Dashboard stat cards 显示 "—"** → 查询逻辑未按 workspaceId 过滤
7. **审批流未实现** → locked 字段 + 审批机制
8. **数据备份自动化** → backup-db.sh 有但未接入 CI

---

## 八、下一步建议

```
Phase 7 → 8 路线:
  ① JWT token 加 workspaceId (地基)
  ② project.create 自动添加 projectMember (私有项目可见性)
  ③ 仪表板按 workspaceId 过滤 (stat cards 修复)
  ④ 审批流设计 (lock + Admin 审批)
  ⑤ 分页接入 (pagination.ts 装到一个列表路由)
```

---

> **审阅说明**：请各 AI 审阅上方每一部分，重点检查：
> 1. 权限模型是否存在旁路（特别关注 workspaceId 缺失问题）
> 2. 数据表设计是否有冗余/缺失字段
> 3. 前端入口是否完备 — 用户能不能找到每个功能的入口
> 4. P0/P1 待办的优先级排序是否正确
> 反馈格式：`[部分 X · Y 节]` + 具体建议
