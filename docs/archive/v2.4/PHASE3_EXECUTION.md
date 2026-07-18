# Phase 3B + 3C 执行计划

> 2026-07-13 · 基于 v2.6-hotfix · 老师建议：负面测试先于实现

## Phase 3B：查询层过滤（预计 2 天）

### 为什么先做负面测试
老师原话：如果先写实现、后补测试，很容易只测"正常情况能不能看到自己的数据"，
却忘了测"能不能看到别人的数据"——后者才是数据隔离真正要防的事。

### 步骤 1：负面测试（先写，预计 1h）

```typescript
// 新增文件: server/routers/workspace.test.ts

describe("多租户数据隔离 - 负面测试", () => {
  it("用户 A 请求用户 B 的项目 → 403", async () => {
    // userA 登录 → 创建 projectA → userB 登录 → 请求 projectA → expect 403
  });

  it("不属于该 workspace 的用户请求 workspace 数据 → 403", async () => {
    // 注册 userX → 不加入 workspace → 请求 workspace 项目列表 → expect 空或403
  });

  it("移出 workspace 后 token 拒绝访问", async () => {
    // 加入 workspace → 生成 token → 移出 → token 请求 → 403
  });

  // 验证命令
  it("所有项目级查询都有 workspaceId 过滤", () => {
    // 扫描 routers.ts 确认所有涉及 project 的 query 都含 workspaceId
  });
});
```

### 步骤 2：查询层实现（预计 4h）

逐文件过 routers.ts 的 75+ 个 query/mutation，确保：
- projects.list → 过滤当前 workspace
- projects.create → 自动关联当前 workspace
- tasks.* → 通过 projectId 间接关联 workspace
- costs.* / revenues.* / expenses.* → 同上
- files.* → 同上
- vendors.* / customers.* → 同上

### 步骤 3：N+1 消除（预计 1h）

Phase 2 评估报告发现的三处 N+1：
- analytics.getProjectStats → 每列查一次 → JOIN
- dashboard.stats → 每项目查一次 → 批量查询
- report.handleReport → 逐列统计 → 一次查询

### 验证命令
```bash
# 负面测试
npx vitest run server/routers/workspace.test.ts

# 全量回归
npm run check
```

## Phase 3C：UI + 机器人（预计 1 天）

### 批次 1：工作区 UI（2h）
- TopNavBar 或 ChronosLayout 加 workspace 下拉切换
- /workspaces 页面：创建工作区 + 查看成员

### 批次 2：邀请链接（1h）
- /invite/:token → 注册 → 自动加入 workspace
- workspace 设置页生成邀请链接

### 批次 3：机器人适配（2h）
- 机器人命令读取 workspace 数据
- /切换 workspace 命令
- bot-bind 页面加 workspace 选择

## 每个批次的验证
```
改完一批 → npm run check → 绿了 → 提交 → 等 CI → 下一批
```
