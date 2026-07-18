import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock 访问控制模块：本文件只测命令分发逻辑，权限闸的真实行为
// 由 security.test.ts 用真实 DB 覆盖。注意保留真实 BotAccessDenied 类
// （executor 里有 instanceof 判断）。
vi.mock("./access", async importOriginal => {
  const actual = await importOriginal<typeof import("./access")>();
  return {
    ...actual,
    isTempBotUser: vi.fn().mockResolvedValue(false),
    assertBotCommandAllowed: vi.fn().mockResolvedValue(undefined),
    assertBotProjectAccess: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock all command handlers before importing executor
vi.mock("./commands/tasks", () => ({
  handleTasks: vi.fn().mockResolvedValue("tasks result"),
}));
vi.mock("./commands/create", () => ({
  handleCreate: vi.fn().mockResolvedValue("create result"),
}));
vi.mock("./commands/complete", () => ({
  handleComplete: vi.fn().mockResolvedValue("complete result"),
}));
vi.mock("./commands/today", () => ({
  handleToday: vi.fn().mockResolvedValue("today result"),
}));
vi.mock("./commands/cost", () => ({
  handleCost: vi.fn().mockResolvedValue("cost result"),
  handleCostStats: vi.fn().mockResolvedValue("cost stats result"),
}));
vi.mock("./commands/report", () => ({
  handleReport: vi.fn().mockResolvedValue("report result"),
}));
vi.mock("./commands/import", () => ({
  handleImport: vi.fn().mockResolvedValue("import result"),
}));
vi.mock("./commands/help", () => ({
  handleHelp: vi.fn().mockResolvedValue("help result"),
}));
vi.mock("./commands/files", () => ({
  handleFiles: vi.fn().mockResolvedValue("files result"),
  handleFileNotes: vi.fn().mockResolvedValue("file notes result"),
}));
vi.mock("./commands/project", () => ({
  handleProjects: vi.fn().mockResolvedValue("projects result"),
  handleProjectInfo: vi.fn().mockResolvedValue("project info result"),
}));

import { executeCommand } from "./executor";
import * as tasksMod from "./commands/tasks";
import * as createMod from "./commands/create";
import * as completeMod from "./commands/complete";
import * as todayMod from "./commands/today";
import * as costMod from "./commands/cost";
import * as reportMod from "./commands/report";
import * as importMod from "./commands/import";
import * as helpMod from "./commands/help";
import * as filesMod from "./commands/files";
import * as projectMod from "./commands/project";

describe("bot executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dispatchCases: {
    input: string;
    handler: string;
    params?: Record<string, unknown>;
  }[] = [
    { input: "!帮助", handler: "help" },
    {
      input: "!任务",
      handler: "tasks",
      params: { projectId: 1, showAll: false },
    },
    {
      input: "!任务 全部",
      handler: "tasks",
      params: { projectId: 1, showAll: true },
    },
    {
      input: "!创建 新任务",
      handler: "create",
      params: { projectId: 1, userId: 42, title: "新任务" },
    },
    {
      input: "!完成 #5",
      handler: "complete",
      params: { taskId: 5, projectId: 1 },
    },
    { input: "!今日", handler: "today", params: { projectId: 1 } },
    {
      input: "!成本 100 咖啡",
      handler: "cost",
      params: { projectId: 1, userId: 42, args: "100|||咖啡" },
    },
    { input: "!报表", handler: "report", params: { projectId: 1 } },
    {
      input: "!导入\n工单",
      handler: "import",
      params: { projectId: 1, userId: 42, args: "工单" },
    },
    { input: "!文件", handler: "files", params: { projectId: 1 } },
    {
      input: "!文件 备注 #3 hi",
      handler: "fileNotes",
      params: { fileId: 3, notes: "hi" },
    },
    { input: "!项目", handler: "projects" },
    {
      input: "!项目 切换 #2",
      handler: "projectInfo",
      params: { projectId: 2 },
    },
  ];

  dispatchCases.forEach(({ input, handler, params }) => {
    it(`dispatches "${input}" to ${handler}`, async () => {
      const result = await executeCommand(input, 42, 1);

      if (handler === "tasks") {
        expect(tasksMod.handleTasks).toHaveBeenCalledWith(
          params?.projectId,
          42,
          params?.showAll
        );
      } else if (handler === "create") {
        expect(createMod.handleCreate).toHaveBeenCalledWith(
          params?.projectId,
          42,
          params?.title
        );
      } else if (handler === "complete") {
        expect(completeMod.handleComplete).toHaveBeenCalledWith(
          params?.taskId,
          params?.projectId,
          42
        );
      } else if (handler === "today") {
        expect(todayMod.handleToday).toHaveBeenCalledWith(
          params?.projectId,
          42
        );
      } else if (handler === "cost") {
        expect(costMod.handleCost).toHaveBeenCalledWith(
          params?.projectId,
          42,
          params?.args
        );
      } else if (handler === "report") {
        expect(reportMod.handleReport).toHaveBeenCalled();
      } else if (handler === "import") {
        expect(importMod.handleImport).toHaveBeenCalled();
      } else if (handler === "files") {
        expect(filesMod.handleFiles).toHaveBeenCalledWith(
          params?.projectId,
          42,
          expect.any(String)
        );
      } else if (handler === "fileNotes") {
        expect(filesMod.handleFileNotes).toHaveBeenCalledWith(
          params?.fileId,
          params?.notes
        );
      } else if (handler === "projects") {
        expect(projectMod.handleProjects).toHaveBeenCalled();
      } else if (handler === "projectInfo") {
        expect(projectMod.handleProjectInfo).toHaveBeenCalledWith(
          params?.projectId,
          42
        );
      } else if (handler === "help") {
        expect(helpMod.handleHelp).toHaveBeenCalled();
      }

      expect(result.reply).toBeDefined();
    });
  });

  it("returns unknown reply for unrecognized input", async () => {
    const result = await executeCommand("!随意输入", 1, 1);
    expect(result.reply).toBeDefined();
    expect(result.reply).toContain("没看懂");
  });

  it("handles empty input gracefully", async () => {
    const result = await executeCommand("", 1, 1);
    expect(result.reply).toBeDefined();
  });

  it("passes appUrl to help handler", async () => {
    await executeCommand("!帮助", 1, 1, "https://example.com");
    expect(helpMod.handleHelp).toHaveBeenCalledWith("https://example.com");
  });
});
