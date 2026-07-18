/**
 * AI Router 测试 — 真实路由级 in-process 测试 (替代占位 it.todo)
 *
 * 被测真实模块:
 *   - ./ai (aiRouter)        → plan / confirm / cancel / history 路由全链路
 *   - ../services/ai/PolicyEngine → evaluate (confirm 阶段真实权限门)
 *   - ../db (ai_runs / ai_execution_logs / projects) → 真实落库断言
 *
 * 仅 mock ../services/ai/AgentService.plan (LLM 调用层), Executor/DB 全部真实。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

vi.mock("../services/ai/AgentService", () => ({
  plan: vi.fn(),
}));

import { plan as mockPlanFn } from "../services/ai/AgentService";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";

const mockPlan = vi.mocked(mockPlanFn);
const PASSWORD = "Abcd1234!@kkk";

let server: http.Server;
let url: string;
let token: string;
let workspaceId: number;
let userId: number;

function unwrap(r: any) {
  return r?.result?.data?.json ?? r?.result?.data;
}
function errMsg(r: any): string {
  return r?.error?.json?.message ?? r?.error?.message ?? "";
}
async function api(path: string, body?: any) {
  const res = await fetch(`${url}/api/trpc/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-workspace-id": String(workspaceId),
    },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}
async function apiGet(path: string) {
  const res = await fetch(`${url}/api/trpc/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-workspace-id": String(workspaceId),
    },
  });
  return res.json();
}
async function sqlite() {
  return (await import("../db/connection")).sqlite;
}

const PLAN_RESULT = {
  plan: {
    intent: "CREATE_PROJECT",
    commands: [
      {
        action: "create_project",
        params: { name: "faketest-ai-proj" },
        command_version: 1,
      },
    ],
    reasoning_summary: "创建项目",
    schema_version: 1,
  },
  cost: {
    inputTokens: 100,
    outputTokens: 50,
    cost: 0.0002,
    model: "gpt-4o-mini",
    durationMs: 42,
  },
};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: async (o: any) => createContext(o),
    })
  );
  await new Promise<void>(resolve => {
    server = app.listen(0, () => {
      url = `http://localhost:${(server.address() as any).port}`;
      resolve();
    });
  });

  // 真实注册 + 登录 (注册自动创建专属 workspace, 角色 owner)
  const email = `faketest-ai-${Date.now()}@t.dev`;
  const reg = await (
    await fetch(`${url}/api/trpc/auth.register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ft-ai", email, password: PASSWORD }),
    })
  ).json();
  userId = unwrap(reg)?.userId;
  const lg = await (
    await fetch(`${url}/api/trpc/auth.login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
  ).json();
  token = unwrap(lg)?.token;
  expect(token).toBeTruthy();
  const wsList = unwrap(await apiGet("workspaces.list"));
  workspaceId = wsList?.[0]?.id;
  expect(workspaceId).toBeGreaterThan(0);
}, 20000);

afterAll(async () => {
  server?.close();
  const db = await sqlite();
  db.prepare(
    "DELETE FROM ai_execution_logs WHERE run_id IN (SELECT id FROM ai_runs WHERE userId = ?)"
  ).run(userId);
  db.prepare("DELETE FROM ai_runs WHERE userId = ?").run(userId);
  db.prepare("DELETE FROM projectMembers WHERE userId = ?").run(userId);
  db.prepare("DELETE FROM projects WHERE name LIKE 'faketest-%'").run();
  db.prepare("DELETE FROM workspace_members WHERE userId = ?").run(userId);
  db.prepare("DELETE FROM workspaces WHERE createdBy = ?").run(userId);
  db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
});

describe("ai.plan 路由 · 真实落库", () => {
  it("plan → 返回 runId + Plan JSON, ai_runs/ai_execution_logs 真实落库", async () => {
    mockPlan.mockResolvedValue(PLAN_RESULT as any);
    const r = unwrap(await api("ai.plan", { prompt: "建个项目", workspaceId }));
    expect(r.runId).toBeGreaterThan(0);
    expect(r.plan.intent).toBe("CREATE_PROJECT");
    expect(r.idempotencyKey).toBeTruthy();

    const db = await sqlite();
    const run = db
      .prepare(
        "SELECT status, plan, userId, workspaceId FROM ai_runs WHERE id = ?"
      )
      .get(r.runId) as any;
    expect(run.status).toBe("pending");
    expect(run.userId).toBe(userId);
    expect(run.workspaceId).toBe(workspaceId);
    expect(JSON.parse(run.plan).commands[0].action).toBe("create_project");

    const log = db
      .prepare(
        "SELECT model, status, input_tokens, output_tokens FROM ai_execution_logs WHERE run_id = ?"
      )
      .get(r.runId) as any;
    expect(log).toMatchObject({
      model: "gpt-4o-mini",
      status: "success",
      input_tokens: 100,
      output_tokens: 50,
    });
  });

  it("LLM 失败 → run 标记 failed + 错误日志落库 + 错误透出", async () => {
    mockPlan.mockRejectedValue(new Error("LLM 调用失败 (500)"));
    const r = await api("ai.plan", { prompt: "建个项目", workspaceId });
    expect(errMsg(r)).toContain("LLM 调用失败");

    const db = await sqlite();
    const run = db
      .prepare(
        "SELECT id, status FROM ai_runs WHERE userId = ? ORDER BY id DESC LIMIT 1"
      )
      .get(userId) as any;
    expect(run.status).toBe("failed");
    const log = db
      .prepare("SELECT status, error FROM ai_execution_logs WHERE run_id = ?")
      .get(run.id) as any;
    expect(log.status).toBe("error");
    expect(log.error).toContain("LLM 调用失败");
  });

  it("workspaceId 不一致 → 拒绝 (真实多租户校验)", async () => {
    const r = await api("ai.plan", {
      prompt: "x",
      workspaceId: workspaceId + 99999,
    });
    expect(errMsg(r)).toContain("工作区不一致");
  });
});

describe("ai.confirm 路由 · 真实 Executor", () => {
  it("confirm → 真实执行 create_project + 状态机 completed + activity 可溯", async () => {
    mockPlan.mockResolvedValue(PLAN_RESULT as any);
    const p = unwrap(await api("ai.plan", { prompt: "建个项目", workspaceId }));

    const r = unwrap(await api("ai.confirm", { runId: p.runId }));
    expect(r.status).toBe("completed");
    expect(r.successCount).toBe(1);
    expect(r.errors).toEqual([]);

    // 真实项目落库
    const db = await sqlite();
    const proj = db
      .prepare(
        "SELECT id, name, workspaceId FROM projects WHERE name = 'faketest-ai-proj'"
      )
      .get() as any;
    expect(proj).toBeTruthy();
    expect(proj.workspaceId).toBe(workspaceId);
    // run 终态
    expect(
      (
        db
          .prepare("SELECT status FROM ai_runs WHERE id = ?")
          .get(p.runId) as any
      )?.status
    ).toBe("completed");
  });

  it("重复 confirm 已完结 run → 「当前状态不可执行」", async () => {
    mockPlan.mockResolvedValue(PLAN_RESULT as any);
    const p = unwrap(await api("ai.plan", { prompt: "建个项目", workspaceId }));
    await api("ai.confirm", { runId: p.runId });
    const r2 = await api("ai.confirm", { runId: p.runId });
    expect(errMsg(r2)).toContain("当前状态不可执行");
  });

  it("confirm 他人 run → 「无权操作」", async () => {
    mockPlan.mockResolvedValue(PLAN_RESULT as any);
    const p = unwrap(await api("ai.plan", { prompt: "建个项目", workspaceId }));

    // 第二个用户
    const email2 = `faketest-ai2-${Date.now()}@t.dev`;
    await fetch(`${url}/api/trpc/auth.register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "ft-ai2",
        email: email2,
        password: PASSWORD,
      }),
    });
    const lg2 = await (
      await fetch(`${url}/api/trpc/auth.login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email2, password: PASSWORD }),
      })
    ).json();
    const token2 = unwrap(lg2)?.token;
    const r = await (
      await fetch(`${url}/api/trpc/ai.confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token2}`,
        },
        body: JSON.stringify({ runId: p.runId }),
      })
    ).json();
    expect(errMsg(r)).toContain("无权操作");

    // 清理第二个用户
    const db = await sqlite();
    const u2 = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email2) as any;
    if (u2) {
      db.prepare("DELETE FROM workspace_members WHERE userId = ?").run(u2.id);
      db.prepare("DELETE FROM workspaces WHERE createdBy = ?").run(u2.id);
      db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(u2.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(u2.id);
    }
  });

  it("cancel → 状态 cancelled, 之后 confirm 被拒绝", async () => {
    mockPlan.mockResolvedValue(PLAN_RESULT as any);
    const p = unwrap(await api("ai.plan", { prompt: "建个项目", workspaceId }));
    const c = unwrap(await api("ai.cancel", { runId: p.runId }));
    expect(c.ok).toBe(true);
    const db = await sqlite();
    expect(
      (
        db
          .prepare("SELECT status FROM ai_runs WHERE id = ?")
          .get(p.runId) as any
      )?.status
    ).toBe("cancelled");
    const r = await api("ai.confirm", { runId: p.runId });
    expect(errMsg(r)).toContain("当前状态不可执行");
  });
});

describe("ai.history 路由 · 真实查询", () => {
  it("history → 返回当前用户的 run 列表, 含本次创建的 run", async () => {
    mockPlan.mockResolvedValue(PLAN_RESULT as any);
    const p = unwrap(await api("ai.plan", { prompt: "建个项目", workspaceId }));

    const list = unwrap(await apiGet("ai.history"));
    expect(Array.isArray(list)).toBe(true);
    const mine = (list as any[]).filter(r => r.userId === userId);
    expect(mine.length).toBeGreaterThan(0);
    const found = mine.find(r => r.id === p.runId);
    expect(found).toBeTruthy();
    expect(JSON.parse(found.plan).intent).toBe("CREATE_PROJECT");
    // 每条记录状态属于真实状态机枚举
    for (const r of mine) {
      expect([
        "planning",
        "pending",
        "pending_approval",
        "executing",
        "completed",
        "failed",
        "cancelled",
      ]).toContain(r.status);
    }
  });
});
