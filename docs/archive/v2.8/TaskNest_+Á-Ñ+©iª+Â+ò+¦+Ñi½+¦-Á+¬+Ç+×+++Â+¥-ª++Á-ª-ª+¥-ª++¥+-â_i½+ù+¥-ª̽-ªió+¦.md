# TaskNest 供应商/客户联系人系统 — 实现方式记录

> 记录时间：2026-07-09
> 系统：TaskNest 团队协作平台
> 功能模块：供应商管理 + 销售方（客户）管理 + 全局搜索

---

## 一、需求概述

为 TaskNest 项目增加以下能力：

1. **供应商管理**：每个项目下可维护多个供应商，每个供应商最多 5 个联系人。
2. **客户（销售方）管理**：每个项目下可维护多个客户，每个客户最多 5 个联系人。
3. **联系人信息**：姓名、手机号、邮箱、角色（采购/销售/经理/其他）、备注。
4. **全局搜索**：在顶部搜索栏可同时搜索任务、项目、供应商、客户、联系人（按姓名/手机号/备注模糊匹配）。
5. **联系人计数显示**：在供应商/客户卡片上实时显示当前联系人数量（如 `2/5`）。

---

## 二、数据库设计（Drizzle ORM + SQLite）

### 2.1 Schema 文件

**路径**：`drizzle/schema.ts`

新增两张表：

#### `customers`（客户/销售方表）

与 `vendors` 表结构对称：

| 字段                      | 类型                  | 说明                             |
| ------------------------- | --------------------- | -------------------------------- |
| `id`                      | `integer`             | 主键，自增                       |
| `projectId`               | `integer`             | 所属项目 ID，外键关联 `projects` |
| `name`                    | `text`                | 客户名称（如"华为技术有限公司"） |
| `description`             | `text`                | 描述，可选                       |
| `createdAt` / `updatedAt` | `integer` (timestamp) | 时间戳                           |

#### `customerContacts`（客户联系人表）

与 `vendorContacts` 表结构对称：

| 字段                      | 类型                  | 说明                                              |
| ------------------------- | --------------------- | ------------------------------------------------- |
| `id`                      | `integer`             | 主键，自增                                        |
| `customerId`              | `integer`             | 所属客户 ID，外键关联 `customers`                 |
| `name`                    | `text`                | 联系人姓名                                        |
| `phone`                   | `text`                | 手机号，可选                                      |
| `email`                   | `text`                | 邮箱，可选                                        |
| `role`                    | `text`                | 枚举：`purchaser` / `sales` / `manager` / `other` |
| `notes`                   | `text`                | 备注，可选                                        |
| `createdAt` / `updatedAt` | `integer` (timestamp) | 时间戳                                            |

### 2.2 数据库关系图

```
projects
  ├── vendors (1:N)
  │     └── vendorContacts (1:N, max 5)
  └── customers (1:N)
        └── customerContacts (1:N, max 5)
```

---

## 三、后端 API 设计（tRPC）

### 3.1 路由注册

**文件**：`server/routers.ts`

新增两个路由命名空间：

- `customers` — 客户 CRUD
- `customerContacts` — 客户联系人 CRUD

### 3.2 数据库查询层

**文件**：`server/db.ts`

新增函数：

| 函数                                  | 说明                               |
| ------------------------------------- | ---------------------------------- |
| `getCustomersByProjectId(projectId)`  | 获取项目下所有客户                 |
| `getCustomerById(customerId)`         | 按 ID 获取客户                     |
| `createCustomer(data)`                | 创建客户                           |
| `getContactsByCustomerId(customerId)` | 获取客户下所有联系人               |
| `createCustomerContact(data)`         | 创建客户联系人（含 ≥5 人校验）     |
| `isMemoryDb()`                        | 导出函数，判断当前是否处于内存模式 |

### 3.3 5 人限制实现

在 `createVendorContact` 和 `createCustomerContact` 中嵌入前置校验：

```typescript
const existing = await db
  .select()
  .from(vendorContacts)
  .where(eq(vendorContacts.vendorId, data.vendorId));
if (existing.length >= 5) {
  throw new Error("每个供应商最多只能添加5个联系人");
}
```

同理适用于 `customerContacts`。

### 3.4 搜索路由

**文件**：`server/routers/search.ts`

新增/修改 `search.global` 查询：

- **输入**：`keyword`（可选）、`startDate`/`endDate`（可选）、`projectId`（可选）、`limit`（默认 20）
- **输出**：包含 5 个分类的结果对象 `{ tasks, projects, vendors, customers, contacts }`

#### 联系人搜索实现（核心）

使用 Drizzle 的 `leftJoin` + `sql` 模板字符串实现跨表 UNION 式检索：

```typescript
// 供应商联系人
const vendorContactsResult = await db
  .select({
    id: vendorContacts.id,
    name: vendorContacts.name,
    phone: vendorContacts.phone,
    email: vendorContacts.email,
    notes: vendorContacts.notes,
    entityId: vendorContacts.vendorId,
    entityType: sql<string>`'vendor'`.as('entityType'),
    entityName: vendors.name,
  })
  .from(vendorContacts)
  .leftJoin(vendors, eq(vendorContacts.vendorId, vendors.id))
  .where(
    or(
      like(vendorContacts.name, contactKeyword),
      like(vendorContacts.phone, contactKeyword),
      like(vendorContacts.notes, contactKeyword)
    )
  )
  .limit(input.limit);

// 客户联系人（结构相同，表不同）
const customerContactsResult = await db
  .select({...})
  .from(customerContacts)
  .leftJoin(customers, eq(customerContacts.customerId, customers.id))
  .where(...)
  .limit(input.limit);

results.contacts = [...vendorContactsResult, ...customerContactsResult].slice(0, input.limit);
```

#### 内存模式兼容

由于开发环境没有配置 MySQL（`DATABASE_URL` 不存在），系统回退到内存模式（mock 数据）。搜索路由同时支持两种模式：

- **真实数据库模式**：执行 Drizzle SQL 查询
- **内存模式**：在 `mockContacts` / `mockCustomerContacts` 数组中用 `filter()` + `includes()` 实现模糊匹配

关键判断：

```typescript
const memoryMode = isMemoryDb();
if (memoryMode) {
  // 在 mock 数据中搜索
} else {
  // 执行 SQL 查询
}
```

---

## 四、前端组件结构

### 4.1 新增页面组件

| 组件                  | 路径                                   | 说明                                                       |
| --------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `SalesManagement.tsx` | `client/src/pages/SalesManagement.tsx` | 客户管理页面（383 行），结构与 `VendorManagement.tsx` 对称 |

### 4.2 修改的组件

| 组件                   | 修改内容                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `App.tsx`              | 注册 `/projects/:projectId/sales` 路由                                                            |
| `ProjectDetail.tsx`    | 添加"客户"导航按钮，点击跳转到销售方管理页                                                        |
| `VendorManagement.tsx` | 添加联系人计数显示（`2/5`、`1/5`、`0/5`）                                                         |
| `TopNavBar.tsx`        | 搜索结果新增"客户"和"联系人"两个分类；placeholder 更新为"搜索任务、项目、供应商、客户、联系人..." |

### 4.3 联系人计数显示逻辑

在 `VendorManagement.tsx` 和 `SalesManagement.tsx` 中，通过 `useQuery` 获取联系人列表，动态计算：

```tsx
const contactsQuery = trpc.vendorContacts.getByVendor.useQuery(vendor.id);
const contactCount = contactsQuery.data?.length || 0;

// 按钮上显示
+添加联系人({ contactCount } / 5);
```

---

## 五、Mock 数据设计

**文件**：`server/db.ts`

为内存模式预置以下 mock 数据：

### 供应商（3 家）

- 阿里云（2 个联系人：张经理、李工）
- 腾讯云（1 个联系人：王销售）
- 钉钉（0 个联系人）

### 客户（2 家）

- 华为技术有限公司（2 个联系人：刘采购、张经理）
- 小米集团（1 个联系人：王总监）

### 联系人角色分布

- `sales`：销售/商务
- `manager`：技术经理
- `purchaser`：采购负责人

---

## 六、文件变更清单

| 文件                                    | 操作 | 说明                                                    |
| --------------------------------------- | ---- | ------------------------------------------------------- |
| `drizzle/schema.ts`                     | 修改 | 新增 `customers`、`customerContacts` 表                 |
| `server/db.ts`                          | 修改 | 新增客户/联系人查询函数、导出 `isMemoryDb` 和 mock 数据 |
| `server/routers.ts`                     | 修改 | 注册 `customers`、`customerContacts` 路由               |
| `server/routers/search.ts`              | 重写 | 支持供应商/客户/联系人的全局搜索，兼容内存模式          |
| `client/src/App.tsx`                    | 修改 | 添加 `/projects/:projectId/sales` 路由                  |
| `client/src/pages/ProjectDetail.tsx`    | 修改 | 添加"客户"导航入口                                      |
| `client/src/pages/VendorManagement.tsx` | 修改 | 添加联系人计数 `(x/5)`                                  |
| `client/src/pages/SalesManagement.tsx`  | 新增 | 客户管理完整页面                                        |
| `client/src/components/TopNavBar.tsx`   | 修改 | 搜索结果分类扩展、placeholder 更新                      |

---

## 七、验证结果

| 测试项             | 结果                                                          |
| ------------------ | ------------------------------------------------------------- |
| 搜索"刘采购"       | ✅ 返回联系人结果，显示手机号和所属公司                       |
| 搜索"13800138001"  | ✅ 返回匹配的联系人                                           |
| 供应商页联系人计数 | ✅ 阿里云 `2/5`、腾讯云 `1/5`、钉钉 `0/5`                     |
| 客户页正常加载     | ✅ 华为（2 联系人）、小米（1 联系人）                         |
| 后端 5 人限制      | ✅ `createVendorContact` / `createCustomerContact` 中嵌入校验 |
| 内存模式搜索       | ✅ 无数据库环境下搜索正常工作                                 |

---

## 八、后续可扩展方向

1. **编辑/删除联系人**：当前仅支持新增，可扩展完整 CRUD。
2. **联系人详情页**：点击联系人可进入详情，查看完整沟通历史。
3. **真实数据库存储**：配置 `DATABASE_URL` 后自动切换到持久化存储。
4. **搜索高亮**：在搜索结果中高亮匹配的关键词。
5. **导出功能**：将供应商/客户列表导出为 Excel/CSV。
