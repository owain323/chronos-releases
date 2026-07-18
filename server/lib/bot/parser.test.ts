import { describe, it, expect } from "vitest";
import { parseCommand, type ParsedCommand } from "./parser";

describe("bot parser", () => {
  const testCases: {
    input: string;
    expected: Omit<ParsedCommand, "taskId" | "fileId"> & {
      taskId?: number;
      fileId?: number;
    };
  }[] = [
    // ── help / 帮助 ──
    { input: "!帮助", expected: { action: "help", args: "" } },
    { input: "!help", expected: { action: "help", args: "" } },
    { input: "!h", expected: { action: "help", args: "" } },
    { input: "!命令", expected: { action: "help", args: "" } },
    { input: "!commands", expected: { action: "help", args: "" } },
    { input: "！帮助", expected: { action: "help", args: "" } }, // 全角感叹号

    // ── tasks / 任务 ──
    { input: "!任务", expected: { action: "tasks", args: "" } },
    { input: "!tasks", expected: { action: "tasks", args: "" } },
    { input: "!task", expected: { action: "tasks", args: "" } },
    { input: "!待办", expected: { action: "tasks", args: "" } },
    { input: "!todo", expected: { action: "tasks", args: "" } },

    // ── task_all / 全部任务 ──
    { input: "!任务 全部", expected: { action: "task_all", args: "" } },
    { input: "!tasks all", expected: { action: "task_all", args: "" } },
    { input: "!task 所有", expected: { action: "task_all", args: "" } },
    { input: "!tasks full", expected: { action: "task_all", args: "" } },

    // ── create / 创建 ──
    {
      input: "!创建 修复登录Bug",
      expected: { action: "create", args: "修复登录Bug" },
    },
    {
      input: "!create Fix bug",
      expected: { action: "create", args: "Fix bug" },
    },
    { input: "!add 新功能", expected: { action: "create", args: "新功能" } },
    { input: "!new Task 1", expected: { action: "create", args: "Task 1" } },

    // ── complete / 完成 ──
    {
      input: "!完成 #5",
      expected: { action: "complete", args: "", taskId: 5 },
    },
    { input: "!完成 5", expected: { action: "complete", args: "", taskId: 5 } },
    {
      input: "!done #3",
      expected: { action: "complete", args: "", taskId: 3 },
    },
    {
      input: "!close 10",
      expected: { action: "complete", args: "", taskId: 10 },
    },
    {
      input: "!finish #7",
      expected: { action: "complete", args: "", taskId: 7 },
    },
    {
      input: "!resolve 1",
      expected: { action: "complete", args: "", taskId: 1 },
    },

    // ── today / 今日 ──
    { input: "!今日", expected: { action: "today", args: "" } },
    { input: "!today", expected: { action: "today", args: "" } },
    { input: "!到期", expected: { action: "today", args: "" } },
    { input: "!due", expected: { action: "today", args: "" } },

    // ── cost / 成本录入 ──
    {
      input: "!成本 500 买服务器",
      expected: { action: "cost", args: "500|||买服务器" },
    },
    {
      input: "!cost 12.50 coffee",
      expected: { action: "cost", args: "12.50|||coffee" },
    },
    {
      input: "!expense 100 办公用品",
      expected: { action: "cost", args: "100|||办公用品" },
    },
    {
      input: "!成本 add 999 打印机",
      expected: { action: "cost", args: "999|||打印机" },
    },
    {
      input: "!cost 添加 200 差旅费",
      expected: { action: "cost", args: "200|||差旅费" },
    },

    // ── report / 报表 ──
    { input: "!报表", expected: { action: "report", args: "" } },
    { input: "!report", expected: { action: "report", args: "" } },
    { input: "!统计", expected: { action: "report", args: "" } },
    { input: "!stats", expected: { action: "report", args: "" } },
    { input: "!周报", expected: { action: "report", args: "" } },
    { input: "!汇总", expected: { action: "report", args: "" } },
    // 成本统计子命令
    { input: "!成本 统计", expected: { action: "report", args: "" } },
    { input: "!cost stats", expected: { action: "report", args: "" } },
    { input: "!成本 汇总", expected: { action: "report", args: "" } },

    // ── import / 导入 ──
    { input: "!导入", expected: { action: "import", args: "" } },
    { input: "!import", expected: { action: "import", args: "" } },
    { input: "!批量", expected: { action: "import", args: "" } },
    {
      input: "!导入\n任务,修Bug,high",
      expected: { action: "import", args: "任务,修Bug,high" },
    },

    // ── files / 文件 ──
    { input: "!文件", expected: { action: "files", args: "" } },
    { input: "!files", expected: { action: "files", args: "" } },
    { input: "!附件", expected: { action: "files", args: "" } },
    { input: "!files list", expected: { action: "files", args: "" } },
    { input: "!文件 列表", expected: { action: "files", args: "" } },
    { input: "!files stats", expected: { action: "files", args: "" } },

    // ── file_notes / 文件备注 ──
    {
      input: "!文件 备注 #3 这是备注",
      expected: { action: "file_notes", args: "这是备注", fileId: 3 },
    },
    {
      input: "!file notes #5 my note",
      expected: { action: "file_notes", args: "my note", fileId: 5 },
    },
    {
      input: "!file note 2 hello",
      expected: { action: "file_notes", args: "hello", fileId: 2 },
    },
    {
      input: "!文件 备注 #10",
      expected: { action: "file_notes", args: "", fileId: 10 },
    },

    // ── project / 项目 ──
    { input: "!项目", expected: { action: "project", args: "" } },
    { input: "!project", expected: { action: "project", args: "" } },
    { input: "!projects", expected: { action: "project", args: "" } },
    { input: "!项目 列表", expected: { action: "project", args: "" } },
    { input: "!projects list", expected: { action: "project", args: "" } },
    { input: "!projects all", expected: { action: "project", args: "" } },

    // ── project_switch / 项目切换 ──
    {
      input: "!项目 切换 #2",
      expected: { action: "project_switch", args: "", taskId: 2 },
    },
    {
      input: "!project use 3",
      expected: { action: "project_switch", args: "", taskId: 3 },
    },
    {
      input: "!project 进入 #1",
      expected: { action: "project_switch", args: "", taskId: 1 },
    },
    {
      input: "!project switch 5",
      expected: { action: "project_switch", args: "", taskId: 5 },
    },

    // ── unknown ──
    {
      input: "!随便说句话",
      expected: { action: "unknown", args: "随便说句话" },
    },
    {
      input: "!没有这个命令 123",
      expected: { action: "unknown", args: "没有这个命令 123" },
    },
    { input: "!   ", expected: { action: "unknown", args: "" } },

    // ── @机器人 前缀剥离 ──
    { input: "@bot !帮助", expected: { action: "help", args: "" } },
    {
      input: "@my_robot !任务 全部",
      expected: { action: "task_all", args: "" },
    },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`parses "${input}" → ${expected.action}`, () => {
      const result = parseCommand(input);
      expect(result.action).toBe(expected.action);
      expect(result.args).toBe(expected.args);
      if (expected.taskId !== undefined)
        expect(result.taskId).toBe(expected.taskId);
      if (expected.fileId !== undefined)
        expect(result.fileId).toBe(expected.fileId);
    });
  });

  it("handles leading whitespace", () => {
    const result = parseCommand("   !今日  ");
    expect(result.action).toBe("today");
  });

  it("handles ! prefix with space", () => {
    const result = parseCommand("! 任务");
    expect(result.action).toBe("tasks");
  });
});
