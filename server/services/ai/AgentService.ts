/**
 * AgentService — AI Planner 核心
 *
 * 红线:
 * · Planner 不访问数据库
 * · 只产生 Plan (建议) · 不执行
 * · schema_version 固定 (当前=1)
 */
import type { Plan, PlanInput, PlanOutput, AICommand } from "./types";
import { callWithRetry } from "./LLMProvider";
import { evaluatePlan } from "./PolicyEngine";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_VERSION = 1;

/** 加载版本化 prompt */
function loadPrompt(version: string = "v1"): string {
  const p = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "prompts",
    `planner_${version}.md`
  );
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  return defaultPrompt();
}

function defaultPrompt(): string {
  return `你是一个项目管理 AI 助手，负责将用户的自然语言描述转换为结构化的操作计划。
你只能生成 CREATE_PROJECT 类型的计划。
输出必须严格符合以下 JSON 格式，不要有多余文字：

{
  "intent": "CREATE_PROJECT",
  "reasoning_summary": "一句话说明你的理解",
  "commands": [
    {
      "action": "create_project",
      "params": { "name": "项目名称", "description": "项目描述" },
      "command_version": 1
    },
    {
      "action": "create_task",
      "params": { "projectName": "项目名称", "title": "任务标题", "description": "任务描述", "priority": "medium" },
      "command_version": 1
    }
  ],
  "schema_version": 1
}

规则:
- 只为用户明确要求的项目生成计划
- 项目名称保持原文，不要翻译或修改
- 任务数量不超过 5 个
- 如果用户没有明确需求，回复 "intent": "CLARIFY"`;
}

/** 校验 LLM 输出的 Plan 格式 */
function validatePlan(raw: any): Plan {
  if (!raw || typeof raw !== "object") throw new Error("LLM 返回无效 JSON");
  if (!["CREATE_PROJECT", "CLARIFY"].includes(raw.intent)) {
    throw new Error(`未知 intent: ${raw.intent}`);
  }

  const commands: AICommand[] = Array.isArray(raw.commands) ? raw.commands : [];

  // 校验每条 command
  for (const cmd of commands) {
    if (!cmd.action || typeof cmd.action !== "string")
      throw new Error("Command 缺少 action");
    if (!cmd.params || typeof cmd.params !== "object")
      throw new Error("Command 缺少 params");
    cmd.command_version = cmd.command_version || 1;
  }

  return {
    intent: raw.intent,
    commands,
    reasoning_summary: raw.reasoning_summary || "",
    schema_version: raw.schema_version || SCHEMA_VERSION,
  };
}

/**
 * AgentService.plan() — 生成执行计划
 *
 * 流程:
 *   prompt → LLMProvider → JSON Parse → validatePlan → PolicyEngine.check → PlanOutput
 */
export async function plan(input: PlanInput): Promise<PlanOutput> {
  const systemPrompt = loadPrompt("v1");
  const userPrompt = `工作区: ${input.workspaceId}\n用户角色: ${input.workspaceRole}\n用户输入: ${input.prompt}`;

  const result = await callWithRetry({
    systemPrompt,
    userPrompt,
    model: process.env.AI_MODEL || "gpt-4o-mini",
    maxTokens: 2000,
    temperature: 0.3,
  });

  // 解析 JSON (LLM 可能返回 markdown 包裹的 JSON)
  let raw: any;
  try {
    const cleaned = result.content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    raw = JSON.parse(cleaned);
  } catch (e: unknown) {
    console.warn(
      "[Agent] operation failed:",
      e instanceof Error ? e.message : String(e)
    );
    throw new Error("AI 返回格式错误，请重试");
  }

  const plan = validatePlan(raw);

  // PolicyEngine 检查
  if (plan.intent === "CLARIFY") {
    return {
      plan,
      cost: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        model: result.model,
        durationMs: result.durationMs,
      },
    };
  }

  const decision = evaluatePlan(plan.commands, input.workspaceRole);
  if (decision === "DENY") {
    throw new Error("权限不足: 当前角色无法执行这些操作");
  }

  return {
    plan,
    cost: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cost: result.cost,
      model: result.model,
      durationMs: result.durationMs,
    },
  };
}
