/**
 * AgentService 测试 — 真实 plan() 全链路
 *
 * 被测真实模块:
 *   - ./AgentService  → plan() (prompt 加载 → LLM → JSON 清洗 → validatePlan → PolicyEngine)
 *   - ./PolicyEngine  → evaluatePlan (真实权限门, 不 mock)
 *
 * 仅 mock ./LLMProvider.callWithRetry (网络层), 其余全部真实执行。
 * 此前版本断言测试文件内联的字面量 plan 对象, 与真实源码零关联 — 已废弃。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LLMCallResult } from "./types";

vi.mock("./LLMProvider", () => ({
  callWithRetry: vi.fn(),
}));

import { callWithRetry } from "./LLMProvider";
import { plan } from "./AgentService";

const mockLLM = vi.mocked(callWithRetry);

function llmResult(content: string): LLMCallResult {
  return {
    content,
    model: "gpt-4o-mini",
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.0002,
    durationMs: 42,
  };
}

const INPUT = {
  prompt: "建一个官网项目",
  workspaceId: 1,
  userId: 1,
  workspaceRole: "owner",
};

const VALID_PLAN_JSON = JSON.stringify({
  intent: "CREATE_PROJECT",
  reasoning_summary: "创建官网项目",
  commands: [
    { action: "create_project", params: { name: "官网" }, command_version: 1 },
    {
      action: "create_task",
      params: { projectName: "官网", title: "搭框架" },
      command_version: 1,
    },
  ],
  schema_version: 1,
});

beforeEach(() => vi.clearAllMocks());

describe("AgentService.plan · 真实校验链", () => {
  it("接受合法 Plan (含 markdown ```json 包裹清洗), 透传成本", async () => {
    mockLLM.mockResolvedValue(
      llmResult("```json\n" + VALID_PLAN_JSON + "\n```")
    );
    const out = await plan(INPUT);
    expect(out.plan.intent).toBe("CREATE_PROJECT");
    expect(out.plan.commands).toHaveLength(2);
    expect(out.plan.schema_version).toBe(1);
    expect(out.plan.reasoning_summary).toBe("创建官网项目");
    expect(out.cost).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      cost: 0.0002,
      model: "gpt-4o-mini",
      durationMs: 42,
    });
  });

  it("command 缺 command_version 时由真实 validatePlan 补默认值 1", async () => {
    const raw = JSON.parse(VALID_PLAN_JSON);
    delete raw.commands[0].command_version;
    mockLLM.mockResolvedValue(llmResult(JSON.stringify(raw)));
    const out = await plan(INPUT);
    expect(out.plan.commands[0].command_version).toBe(1);
  });

  it("未知 intent → 拒绝", async () => {
    mockLLM.mockResolvedValue(
      llmResult(
        JSON.stringify({
          intent: "DELETE_EVERYTHING",
          commands: [],
          reasoning_summary: "",
          schema_version: 1,
        })
      )
    );
    await expect(plan(INPUT)).rejects.toThrow("未知 intent");
  });

  it("LLM 返回非 JSON → 「AI 返回格式错误」", async () => {
    mockLLM.mockResolvedValue(llmResult("抱歉, 我无法理解"));
    await expect(plan(INPUT)).rejects.toThrow("AI 返回格式错误");
  });

  it("command 缺 params → 拒绝", async () => {
    mockLLM.mockResolvedValue(
      llmResult(
        JSON.stringify({
          intent: "CREATE_PROJECT",
          commands: [{ action: "create_project", command_version: 1 }],
          reasoning_summary: "",
          schema_version: 1,
        })
      )
    );
    await expect(plan(INPUT)).rejects.toThrow("Command 缺少 params");
  });

  it("CLARIFY 意图直接返回, 不触发 PolicyEngine (viewer 角色也可)", async () => {
    mockLLM.mockResolvedValue(
      llmResult(
        JSON.stringify({
          intent: "CLARIFY",
          commands: [],
          reasoning_summary: "请说明项目细节",
          schema_version: 1,
        })
      )
    );
    const out = await plan({ ...INPUT, workspaceRole: "viewer" });
    expect(out.plan.intent).toBe("CLARIFY");
  });

  it("真实 PolicyEngine: member 角色 + delete_project(CRITICAL) → DENY", async () => {
    mockLLM.mockResolvedValue(
      llmResult(
        JSON.stringify({
          intent: "CREATE_PROJECT",
          commands: [
            { action: "delete_project", params: { id: 1 }, command_version: 1 },
          ],
          reasoning_summary: "",
          schema_version: 1,
        })
      )
    );
    await expect(plan({ ...INPUT, workspaceRole: "member" })).rejects.toThrow(
      "权限不足"
    );
  });

  it("真实 PolicyEngine: owner 角色 + delete_project → 放行", async () => {
    mockLLM.mockResolvedValue(
      llmResult(
        JSON.stringify({
          intent: "CREATE_PROJECT",
          commands: [
            { action: "delete_project", params: { id: 1 }, command_version: 1 },
          ],
          reasoning_summary: "",
          schema_version: 1,
        })
      )
    );
    const out = await plan({ ...INPUT, workspaceRole: "owner" });
    expect(out.plan.commands[0].action).toBe("delete_project");
  });

  it("未知 action (不在权限表) → DENY", async () => {
    mockLLM.mockResolvedValue(
      llmResult(
        JSON.stringify({
          intent: "CREATE_PROJECT",
          commands: [
            { action: "drop_database", params: {}, command_version: 1 },
          ],
          reasoning_summary: "",
          schema_version: 1,
        })
      )
    );
    await expect(plan(INPUT)).rejects.toThrow("权限不足");
  });
});
