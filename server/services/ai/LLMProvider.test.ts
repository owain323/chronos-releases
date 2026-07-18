// LLMProvider → recordAiUsage 接线测试（v3.8 安全/可观测性修复）
// 验证: callWithRetry 成功路径按模型聚合 token 用量；失败路径不记录。
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { callWithRetry } from "./LLMProvider";
import { getAiUsageSnapshot, resetAiUsage } from "../../lib/ai-usage";

function mockFetchOnce(body: unknown, status = 200): void {
  const fn = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", fn);
}

describe("LLMProvider.callWithRetry → recordAiUsage", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    resetAiUsage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("成功调用后按模型聚合 token 用量", async () => {
    mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    });

    const result = await callWithRetry({
      systemPrompt: "s",
      userPrompt: "u",
      model: "gpt-4o-mini",
    });
    expect(result.content).toBe("ok");

    const snap = getAiUsageSnapshot();
    const m = snap.models.find(x => x.model === "gpt-4o-mini");
    expect(m).toBeTruthy();
    expect(m!.calls).toBe(1);
    expect(m!.promptTokens).toBe(120);
    expect(m!.completionTokens).toBe(30);
    expect(m!.totalTokens).toBe(150);
    expect(snap.totals.calls).toBe(1);
    expect(snap.totals.totalTokens).toBe(150);
  });

  it("失败调用（非可重试错误）不记录用量", async () => {
    mockFetchOnce("boom", 500);
    await expect(
      callWithRetry({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow();
    expect(getAiUsageSnapshot().totals.calls).toBe(0);
  });
});

// ─────────── 真实定价表 / 成本计算 / 预算上限 (经由真实 callWithRetry 输出) ───────────
// 定价表 MODEL_PRICING 为模块私有常量, 只能经由真实调用链的 result.cost 断言——
// 改价即改变下列期望值, 测试随之变红 (变异敏感)。
describe("LLMProvider 成本计算 · 真实定价表", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    resetAiUsage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it("gpt-4o-mini 按 1.0/4.0 元/1M tokens 计价", async () => {
    // 120*1.0/1e6 + 30*4.0/1e6 = 0.00024 → round4 = 0.0002
    mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    });
    const r = await callWithRetry({
      systemPrompt: "s",
      userPrompt: "u",
      model: "gpt-4o-mini",
    });
    expect(r.cost).toBe(0.0002);
  });

  it("同样 token 用量下 gpt-4o (17.4/52.2) 成本远超 gpt-4o-mini", async () => {
    // 10000*17.4/1e6 + 5000*52.2/1e6 = 0.174 + 0.261 = 0.435 > 预算上限 0.30 → 拒绝
    mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10000, completion_tokens: 5000 },
    });
    await expect(
      callWithRetry({ systemPrompt: "s", userPrompt: "u", model: "gpt-4o" })
    ).rejects.toThrow("超过预算上限");

    // mini: 0.01 + 0.02 = 0.03 → 放行
    mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10000, completion_tokens: 5000 },
    });
    const r = await callWithRetry({
      systemPrompt: "s",
      userPrompt: "u",
      model: "gpt-4o-mini",
    });
    expect(r.cost).toBe(0.03);
  });

  it("未知模型回退默认 (gpt-4o-mini) 定价", async () => {
    mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10000, completion_tokens: 5000 },
    });
    const r = await callWithRetry({
      systemPrompt: "s",
      userPrompt: "u",
      model: "no-such-model",
    });
    expect(r.model).toBe("no-such-model");
    expect(r.cost).toBe(0.03); // 与 gpt-4o-mini 相同
  });

  it("超预算调用被拒绝且不记录用量", async () => {
    mockFetchOnce({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 10_000_000, completion_tokens: 0 }, // mini: ¥10 ≫ 0.30
    });
    await expect(
      callWithRetry({
        systemPrompt: "s",
        userPrompt: "u",
        model: "gpt-4o-mini",
      })
    ).rejects.toThrow("超过预算上限");
    expect(getAiUsageSnapshot().totals.calls).toBe(0);
  });
});
