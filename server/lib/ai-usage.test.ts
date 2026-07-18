import { describe, it, expect, beforeEach } from "vitest";
import { recordAiUsage, getAiUsageSnapshot, resetAiUsage } from "./ai-usage";

describe("ai-usage", () => {
  beforeEach(() => resetAiUsage());

  it("aggregates token usage per model", () => {
    recordAiUsage("gpt-4o", {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
    recordAiUsage("gpt-4o", {
      prompt_tokens: 20,
      completion_tokens: 5,
      total_tokens: 25,
    });
    recordAiUsage("claude", {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    });

    const snap = getAiUsageSnapshot();
    expect(snap.totals.calls).toBe(3);
    expect(snap.totals.totalTokens).toBe(42);

    const gpt = snap.models.find(m => m.model === "gpt-4o");
    expect(gpt?.calls).toBe(2);
    expect(gpt?.totalTokens).toBe(40);
  });

  it("ignores undefined usage", () => {
    recordAiUsage("x", undefined);
    expect(getAiUsageSnapshot().totals.calls).toBe(0);
  });

  it("defaults model name to unknown", () => {
    recordAiUsage(undefined, { total_tokens: 7 });
    expect(getAiUsageSnapshot().models[0]?.model).toBe("unknown");
  });

  it("sorts models by total tokens desc", () => {
    recordAiUsage("small", { total_tokens: 1 });
    recordAiUsage("big", { total_tokens: 100 });
    const models = getAiUsageSnapshot().models;
    expect(models[0]?.model).toBe("big");
  });
});
