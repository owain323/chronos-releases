/**
 * Tasks Router 测试 — 全部真实 import + 真实 DB fixture + in-process HTTP
 *
 * 被测真实模块:
 *   - ../db/accounting         → createJournalEntry / createAccount (借贷平衡不变式)
 *   - ../lib/notifications     → broadcastToProject (SSRF guard 行为级断言)
 *   - ../db/financial-reports  → parseAccountsCsv / parseEntriesCsv (真实 CSV 解析)
 *   - ../lib/project-guard     → requireEntityAccess (真实权限守卫)
 *   - tasks 路由 (appRouter)   → 真实任务 CRUD 流程
 *
 * 注: CSV 导出侧公式注入防护 (csvEscape) 内联在 client/src/pages/TaskList.tsx
 *     且未导出, 无法真实 import —— 已在最终报告标注「需源码抽取后方可测」,
 *     此处不再复制字面量逻辑造假测试。
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "../_core/context";
import { createJournalEntry, createAccount } from "../db/accounting";
import { broadcastToProject } from "../lib/notifications";
import { parseAccountsCsv, parseEntriesCsv } from "../db/financial-reports";
import { requireEntityAccess } from "../lib/project-guard";

const PASSWORD = "Abcd1234!@kkk";

// ─────────── 借贷平衡: 真实 createJournalEntry + 测试库 fixture ───────────
describe("createJournalEntry 借贷平衡 · 真实 accounting 模块", () => {
  let projectId: number;
  let assetId: number; // 借方科目 (asset)
  let liabilityId: number; // 贷方科目 (liability)
  let foreignAccountId: number; // 属于其他项目的科目

  async function sqlite() {
    return (await import("../db/connection")).sqlite;
  }
  function balanceOf(id: number, db: any) {
    return (
      (db.prepare("SELECT balance FROM accounts WHERE id = ?").get(id) as any)
        ?.balance ?? 0
    );
  }

  beforeAll(async () => {
    const db = await sqlite();
    // fixture 项目 (faketest-% 前缀, 用后直接删)
    const p = db
      .prepare(
        "INSERT INTO projects (name, workspaceId, ownerId, createdAt, updatedAt) VALUES (?, 0, 0, ?, ?)"
      )
      .run(
        "faketest-acct-project",
        new Date().toISOString(),
        new Date().toISOString()
      );
    projectId = Number(p.lastInsertRowid);
    const p2 = db
      .prepare(
        "INSERT INTO projects (name, workspaceId, ownerId, createdAt, updatedAt) VALUES (?, 0, 0, ?, ?)"
      )
      .run(
        "faketest-acct-other",
        new Date().toISOString(),
        new Date().toISOString()
      );

    assetId = Number(
      (
        await createAccount({
          projectId,
          code: "FT1001",
          name: "faketest-现金",
          type: "asset",
        })
      ).lastInsertRowid
    );
    liabilityId = Number(
      (
        await createAccount({
          projectId,
          code: "FT2001",
          name: "faketest-借款",
          type: "liability",
        })
      ).lastInsertRowid
    );
    foreignAccountId = Number(
      (
        await createAccount({
          projectId: Number(p2.lastInsertRowid),
          code: "FT9001",
          name: "faketest-外部",
          type: "asset",
        })
      ).lastInsertRowid
    );
    // 记录 fixture 的另一个项目 id 供清理
    otherProjectId = Number(p2.lastInsertRowid);
  });

  let otherProjectId: number;

  afterAll(async () => {
    const db = await sqlite();
    db.prepare("DELETE FROM journalEntries WHERE projectId IN (?, ?)").run(
      projectId,
      otherProjectId
    );
    db.prepare("DELETE FROM accounts WHERE name LIKE 'faketest-%'").run();
    db.prepare("DELETE FROM projects WHERE name LIKE 'faketest-%'").run();
  });

  it("借贷不平衡 → 服务端拒绝 (借 100 ≠ 贷 50)", async () => {
    await expect(
      createJournalEntry({
        projectId,
        date: "2026-01-01",
        description: "faketest-不平衡",
        debitAccountId: assetId,
        debitAmount: 100,
        creditAccountId: liabilityId,
        creditAmount: 50,
      })
    ).rejects.toThrow("借贷金额不平衡");
  });

  it("容差内 (|差| ≤ 0.01) 通过平衡校验, 容差外拒绝", async () => {
    // 容差外: 在平衡校验阶段即拒绝
    await expect(
      createJournalEntry({
        projectId,
        date: "2026-01-01",
        description: "faketest-容差外",
        debitAccountId: assetId,
        debitAmount: 100.02,
        creditAccountId: liabilityId,
        creditAmount: 100,
      })
    ).rejects.toThrow("借贷金额不平衡");
    // 容差内: 通过平衡校验并正常落库（事务回调缺陷已修复, 不再以
    // rejects 形式旁路断言——彼时成功路径必抛事务错误, 该写法已失效）
    await expect(
      createJournalEntry({
        projectId,
        date: "2026-01-01",
        description: "faketest-容差内",
        debitAccountId: assetId,
        debitAmount: 100.005,
        creditAccountId: liabilityId,
        creditAmount: 100,
      })
    ).resolves.toMatchObject({ changes: 1 });
  });

  // 源码缺陷已修复: server/db/accounting.ts 事务回调已改为同步, 平衡分录
  // 可正常落库并更新余额。以下恢复为正式断言。
  it("平衡分录落库并按科目类型更新余额 (asset 借+, liability 贷+)", async () => {
    const db = await sqlite();
    const a0 = balanceOf(assetId, db);
    const l0 = balanceOf(liabilityId, db);
    await createJournalEntry({
      projectId,
      date: "2026-01-02",
      description: "faketest-平衡",
      debitAccountId: assetId,
      debitAmount: 500,
      creditAccountId: liabilityId,
      creditAmount: 500,
    });
    expect(balanceOf(assetId, db)).toBeCloseTo(a0 + 500, 6);
    expect(balanceOf(liabilityId, db)).toBeCloseTo(l0 + 500, 6);
    const entry = db
      .prepare(
        "SELECT debitAmount, creditAmount FROM journalEntries WHERE description = 'faketest-平衡'"
      )
      .get() as any;
    expect(entry).toMatchObject({ debitAmount: 500, creditAmount: 500 });
  });

  it("跨项目科目 → 拒绝 (跨租户防护)", async () => {
    await expect(
      createJournalEntry({
        projectId,
        date: "2026-01-03",
        description: "faketest-跨项目",
        debitAccountId: foreignAccountId,
        debitAmount: 10,
        creditAccountId: liabilityId,
        creditAmount: 10,
      })
    ).rejects.toThrow("科目不属于当前项目");
  });
});

// ─────────── SSRF guard: 真实 broadcastToProject 行为级断言 ───────────
describe("broadcastToProject SSRF 防护 · 真实 notifications 模块", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("内网/元数据/环回地址一律不发起 fetch, 仅公网 https 放行", async () => {
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const blocked = [
      "https://127.0.0.1/hook",
      "https://10.0.0.1/hook",
      "https://172.16.0.1/hook",
      "https://192.168.1.1/hook",
      "https://169.254.169.254/latest/meta-data", // 云元数据
      "https://localhost/hook",
      "https://metadata.google.internal/hook",
      "https://0x7f000001/hook", // hex 编码 (URL 归一化为 127.0.0.1)
      "http://api.example.com/hook", // 非 https
    ];
    const webhooks = [
      ...blocked.map((webhookUrl, i) => ({ id: i + 1, webhookUrl })),
      { id: 999, webhookUrl: "https://api.example.com/hook" },
    ];

    await broadcastToProject(webhooks, "task_created", {
      taskTitle: "t",
      projectName: "p",
    });

    // 只有公网 https 地址触达真实 fetch 层
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://api.example.com/hook");
  }, 15000);

  // SSRF 防护缺口已修复: notifications.ts 现在先剥离 hostname 方括号,
  // 并把 WHATWG 归一化的 IPv6-mapped hex 形式还原为点分十进制再匹配。
  it("带方括号 IPv6 形式 ([::1] / [::ffff:x.x.x.x]) 应被拦截", async () => {
    const fetchSpy = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    await broadcastToProject(
      [
        { id: 1, webhookUrl: "https://[::1]/hook" },
        { id: 2, webhookUrl: "https://[::ffff:127.0.0.1]/hook" },
      ],
      "task_created",
      { taskTitle: "t", projectName: "p" }
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  }, 15000);
});

// ─────────── CSV: 真实 parseAccountsCsv / parseEntriesCsv ───────────
describe("CSV 解析 · 真实 financial-reports 模块", () => {
  it("parseAccountsCsv 解析合法科目表 (中英表头)", () => {
    const r = parseAccountsCsv(
      "code,name,type\n1001,库存现金,asset\n2001,短期借款,liability\n"
    );
    expect(r.errors).toEqual([]);
    expect(r.accounts).toEqual([
      { code: "1001", name: "库存现金", type: "asset" },
      { code: "2001", name: "短期借款", type: "liability" },
    ]);
  });

  it("parseAccountsCsv 拒绝缺行/缺列/未知类型", () => {
    expect(parseAccountsCsv("code,name,type\n").errors).toContain(
      "CSV 至少需要表头 + 一行数据"
    );
    expect(parseAccountsCsv("code,name\n1001,现金\n").errors[0]).toContain(
      "表头缺少必要列"
    );
    const bad = parseAccountsCsv("code,name,type\n1001,现金,notatype\n");
    expect(bad.accounts).toEqual([]);
    expect(bad.errors[0]).toContain("科目类型无法识别");
  });

  it("parseEntriesCsv 强制借贷平衡 + 科目编码映射", () => {
    const map = new Map([
      ["1001", 1],
      ["2001", 2],
    ]);
    const ok = parseEntriesCsv(
      "date,description,debitCode,debitAmount,creditCode,creditAmount\n2026-01-01,收款,1001,100,2001,100\n",
      map
    );
    expect(ok.errors).toEqual([]);
    expect(ok.entries[0]).toMatchObject({
      debitAccountId: 1,
      creditAccountId: 2,
      debitAmount: 100,
    });

    const unbalanced = parseEntriesCsv(
      "date,description,debitCode,debitAmount,creditCode,creditAmount\n2026-01-01,坏账,1001,100,2001,50\n",
      map
    );
    expect(unbalanced.entries).toEqual([]);
    expect(unbalanced.errors[0]).toContain("借贷不平衡");

    const unknownCode = parseEntriesCsv(
      "date,description,debitCode,debitAmount,creditCode,creditAmount\n2026-01-01,坏码,9999,100,2001,100\n",
      map
    );
    expect(unknownCode.errors[0]).toContain("借方科目编码不存在");
  });
});

// ─────────── 权限守卫: 真实 requireEntityAccess ───────────
describe("requireEntityAccess · 真实 project-guard", () => {
  it("不存在的 task 实体 → NOT_FOUND", async () => {
    await expect(requireEntityAccess("task", 999999999, 1)).rejects.toThrow(
      /not found/i
    );
  });
});

// ─────────── 任务 CRUD: 真实路由 in-process (it.todo → 真实测试) ───────────
describe("tasks 路由 CRUD · in-process", () => {
  let server: http.Server;
  let url: string;
  let token: string;
  let workspaceId: number;
  let projectId: number;

  function unwrap(r: any) {
    return r?.result?.data?.json ?? r?.result?.data;
  }
  async function api(path: string, body: any) {
    const res = await fetch(`${url}/api/trpc/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-workspace-id": String(workspaceId),
      },
      body: JSON.stringify(body),
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

    // 注册 + 登录 (注册自动创建专属 workspace)
    const email = `faketest-tasks-${Date.now()}@t.dev`;
    await fetch(`${url}/api/trpc/auth.register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ft-tasks", email, password: PASSWORD }),
    });
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

    const proj = unwrap(
      await api("projects.create", { name: "faketest-crud-project" })
    );
    projectId = proj?.id ?? proj?.lastInsertRowid;
    expect(projectId).toBeGreaterThan(0);
  }, 20000);

  afterAll(async () => {
    server?.close();
    const { sqlite } = await import("../db/connection");
    sqlite.prepare("DELETE FROM tasks WHERE title LIKE 'faketest-%'").run();
    sqlite.prepare("DELETE FROM projects WHERE name LIKE 'faketest-%'").run();
    const ids = (
      sqlite
        .prepare("SELECT id FROM users WHERE email LIKE 'faketest-%'")
        .all() as any[]
    ).map(r => r.id);
    if (ids.length) {
      const ph = ids.map(() => "?").join(",");
      sqlite
        .prepare(`DELETE FROM user_sessions WHERE user_id IN (${ph})`)
        .run(...ids);
      sqlite
        .prepare(`DELETE FROM workspace_members WHERE userId IN (${ph})`)
        .run(...ids);
      sqlite
        .prepare(`DELETE FROM workspaces WHERE createdBy IN (${ph})`)
        .run(...ids);
      sqlite.prepare(`DELETE FROM users WHERE id IN (${ph})`).run(...ids);
    }
  });

  it("create task → DB 可查, 字段完整", async () => {
    const r = unwrap(
      await api("tasks.create", {
        projectId,
        columnId: 1,
        title: "faketest-task-1",
        description: "d",
        order: 0,
      })
    );
    const taskId = r?.id ?? r?.lastInsertRowid;
    expect(taskId).toBeGreaterThan(0);

    const list = unwrap(
      await apiGet(
        `tasks.getByProject?input=${encodeURIComponent(JSON.stringify({ projectId }))}`
      )
    );
    const found = (list as any[]).find(t => t.id === Number(taskId));
    expect(found).toBeTruthy();
    expect(found.title).toBe("faketest-task-1");
    expect(found.priority).toBe("medium"); // 默认值由真实 db 层填充
  });

  it("update task → 标题/优先级生效", async () => {
    const created = unwrap(
      await api("tasks.create", {
        projectId,
        columnId: 1,
        title: "faketest-task-2",
        order: 1,
      })
    );
    const taskId = Number(created?.id ?? created?.lastInsertRowid);

    await api("tasks.update", {
      taskId,
      title: "faketest-task-2-updated",
      priority: "high",
    });
    const detail = unwrap(
      await apiGet(
        `tasks.getById?input=${encodeURIComponent(JSON.stringify({ taskId }))}`
      )
    );
    expect(detail.title).toBe("faketest-task-2-updated");
    expect(detail.priority).toBe("high");
  });

  it("updateColumn 状态流转 + delete 删除", async () => {
    const created = unwrap(
      await api("tasks.create", {
        projectId,
        columnId: 1,
        title: "faketest-task-3",
        order: 2,
      })
    );
    const taskId = Number(created?.id ?? created?.lastInsertRowid);

    // 状态流转: column 1 → 2
    await api("tasks.updateColumn", { taskId, columnId: 2, order: 0 });
    let detail = unwrap(
      await apiGet(
        `tasks.getById?input=${encodeURIComponent(JSON.stringify({ taskId }))}`
      )
    );
    expect(detail.columnId).toBe(2);

    // 删除后查不到
    await api("tasks.delete", { taskId });
    detail = unwrap(
      await apiGet(
        `tasks.getById?input=${encodeURIComponent(JSON.stringify({ taskId }))}`
      )
    );
    expect(detail == null || detail.id == null).toBe(true);
  });

  it("无权限输入被真实 schema 拒绝 (缺 title)", async () => {
    const r = await api("tasks.create", { projectId, columnId: 1, order: 3 });
    expect(r.error).toBeTruthy();
  });
});
