/**
 * LLMProvider — AI 模型调用抽象层
 *
 * 规则:
 * · Planner 调用此层 → 不直接调 LLM
 * · 超时 15s · 重试仅网络错误/429/503
 * · 不重试 bad output (格式校验失败由 Planner 处理)
 */
import type { LLMCallParams, LLMCallResult } from "./types";
import { recordAiUsage } from "../../lib/ai-usage";

/** 模型定价 (元/1M tokens) */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 17.4, output: 52.2 },
  "gpt-4o-mini": { input: 1.0, output: 4.0 },
  "deepseek-chat": { input: 1.0, output: 2.0 },
  "moonshot-v1": { input: 0.6, output: 1.2 },
};

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15_000;
const MAX_COST = 0.3; // 单次预算上限 ¥0.30

/**
 * 底层 LLM 调用 (OpenAI 兼容 API)
 */
async function callLLM(params: LLMCallParams): Promise<LLMCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = params.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY 未设置, AI 功能暂不可用");
  }

  const body = {
    model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    max_tokens: params.maxTokens || 2000,
    temperature: params.temperature ?? 0.3,
  };

  const start = Date.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const durationMs = Date.now() - start;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 调用失败 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error("LLM 返回空内容");
  }

  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const cost =
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output;

  if (cost > MAX_COST) {
    throw new Error(
      `单次调用费用 ¥${cost.toFixed(3)} 超过预算上限 ¥${MAX_COST}`
    );
  }

  return {
    content: choice.message.content,
    model,
    inputTokens,
    outputTokens,
    cost: Math.round(cost * 10000) / 10000,
    durationMs,
  };
}

/**
 * 带重试的 LLM 调用 (仅网络/429/503)
 */
export async function callWithRetry(
  params: LLMCallParams
): Promise<LLMCallResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await callLLM(params);
      // v3.8: 成功路径接入 AI Token 使用监控（按模型聚合，供 /api/ai-usage 暴露）。
      // 此前 recordAiUsage 唯一调用点在无调用方的 invokeLLM，导致监控恒为零。
      recordAiUsage(result.model, {
        prompt_tokens: result.inputTokens,
        completion_tokens: result.outputTokens,
        total_tokens: result.inputTokens + result.outputTokens,
      });
      return result;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      lastError = err;
      // 仅重试网络错误或服务端限流
      const retryable =
        err.cause?.code === "UND_ERR" ||
        err.message?.includes("429") ||
        err.message?.includes("503") ||
        err.message?.includes("timeout");

      if (!retryable || attempt === MAX_RETRIES) break;
      await sleep(1000 * (attempt + 1)); // 1s, 2s 退避
    }
  }

  throw lastError || new Error("LLM 调用失败");
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
