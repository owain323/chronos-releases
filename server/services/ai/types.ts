/**
 * Phase 8 · AI Agent 类型定义
 *
 * 红线:
 * ① AI 只产 Plan (建议) · Executor 产事实
 * ② risk_level 不由 AI 输出 → PolicyEngine 硬编码
 * ③ required_permissions 不由 AI 输出 → PolicyEngine 硬编码
 */

/** PolicyEngine 决策结果 */
export type PolicyDecision = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

/** 单一 AI 指令 — 由 Planner 生成, Executor 执行 */
export type AICommand = {
  action: string; // "create_project" | "create_task" | ...
  params: Record<string, unknown>; // 操作的参数
  command_version: number; // 协议版本 (当前=1)
};

/** Planner 输出 — AI 的完整计划 */
export type Plan = {
  intent: string; // 意图标记 (MVP: "CREATE_PROJECT")
  commands: AICommand[]; // 要执行的指令列表
  reasoning_summary: string; // AI 的推理摘要 (展示给用户)
  schema_version: number; // Schema 版本 (当前=1)
};

/** ai_runs 状态机: 7 个状态 */
export type AIRunStatus =
  | "planning" // Planner 正在生成 Plan
  | "pending" // 等待用户确认
  | "pending_approval" // 部分命令需要管理员审批
  | "executing" // Executor 正在执行
  | "completed" // 执行成功
  | "failed" // 执行失败
  | "cancelled"; // 用户取消

/** ai_runs 表的行类型 */
export type AIRun = {
  id: number;
  userId: number;
  workspaceId: number;
  projectId?: number | null;
  status: AIRunStatus;
  plan: string; // JSON: Plan
  idempotency_key: string; // 幂等键 (UUID)
  createdVia: "AI"; // 固定标记
  prompt_version: string; // 使用的 prompt 版本 (如 v1)
  schema_version: number; // Plan schema 版本
  createdAt: string;
  updatedAt: string;
};

/** ai_execution_logs 行类型 (Step 4 启用) */
export type AIExecutionLog = {
  id: number;
  runId: number; // → ai_runs.id
  model: string; // 使用的模型 (如 gpt-4o)
  promptVersion: string; // prompt 版本
  schemaVersion: number; // Plan schema 版本
  inputTokens: number; // 输入 token 数
  outputTokens: number; // 输出 token 数
  cost: number; // 费用 (元)
  status: "success" | "error"; // 调用结果
  error?: string | null; // 错误信息
  durationMs: number; // 耗时 (毫秒)
  createdAt: string;
};

/** LLM 调用参数 */
export type LLMCallParams = {
  systemPrompt: string;
  userPrompt: string;
  model?: string; // 默认 gpt-4o
  maxTokens?: number; // 默认 2000
  temperature?: number; // 默认 0.3
};

/** LLM 调用结果 */
export type LLMCallResult = {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  durationMs: number;
};

/** AgentService.plan() 的输入 */
export type PlanInput = {
  prompt: string; // 用户的自然语言输入
  workspaceId: number;
  projectId?: number;
  userId: number;
  workspaceRole: string;
};

/** AgentService.plan() 的输出 */
export type PlanOutput = {
  plan: Plan;
  cost: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
    model: string;
    durationMs: number;
  };
};
