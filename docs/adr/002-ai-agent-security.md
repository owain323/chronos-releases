# ADR-002: AI Agent 安全边界

**日期**: 2026-07-12  
**状态**: 已采纳  
**决策者**: 曹子杰

## 背景

CHRONOS 集成 AI 能力（AgentService/Planner/PolicyEngine/LLMProvider）用于自动化任务管理。AI 直接操作数据库存在安全风险（prompt injection、越权操作、数据泄露）。

## 决策

**AI 只生成 Plan，由 PolicyEngine 审核后经 Executor 执行。AI 不直接访问数据库。**

架构：
```
User Input → Planner → Plan (JSON)
                         ↓
                    PolicyEngine (权限校验)
                         ↓
                    Executor (Drizzle API)
                         ↓
                      Database
```

约束：
1. LLMProvider 只能接收上下文摘要，不能接收完整数据行
2. Plan 中的每个 Action 必须包含 `resourceType` + `resourceId` + `action`
3. PolicyEngine 拒绝不在白名单中的 action 类型
4. 所有 AI 操作写入 activity_events (source=AI, category=AI)
5. 第一版暂不深入 AI cost/approval/execution tracking

## 后果

### 正面
- 彻底隔离 AI 和数据库
- Plan 可审计、可回放、可拒绝
- 即使 prompt injection 也无法执行危险操作

### 负面
- AI 无法做复杂多步推理（受 Plan 格式限制）
- 需要持续维护 action 白名单
