# ADR-004: tRPC v11 作为 API 层统一协议

**日期**: 2026-07-10
**状态**: 已采纳
**决策者**: 曹子杰

## 背景

CHRONOS 需要在前后端之间建立类型安全的 API 协议。传统 REST 需要手动维护类型定义和 API 文档，容易产生前后端不一致。

## 选项

1. **REST (Express routes)** — 最常见，但类型不安全
2. **GraphQL (Apollo)** — 类型安全但复杂度高
3. **tRPC** — 端到端类型安全，零样板代码

## 决策

**选择 tRPC v11，理由是端到端类型安全。**

关键设计：
- `server/routers/` 定义 tRPC procedures（自动推导输入/输出类型）
- `client/src/lib/trpc.ts` 导入 `AppRouter` 类型，客户端自动获得智能提示
- `superjson` transformer 支持 Date/Map/Set 等原生类型的序列化
- `httpBatchLink` 批量请求减少往返次数

## 后果

### 正面
- 前后端类型同步：改一个 procedure，客户端编译即可发现不一致
- 开发效率：不需要手写 API 文档或 OpenAPI spec
- 批量请求：减少网络往返

### 负面
- 绑定 tRPC 生态（不易替换为 REST/GraphQL）
- tRPC 不支持非 JS 客户端（但 CHRONOS 不考虑多语言客户端）
- superjson transformer 需要前后端版本一致
