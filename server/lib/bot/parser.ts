/**
 * Bot 命令解析器 v3
 * 前缀: ! 或 /
 */
export interface ParsedCommand {
  action:
    | "tasks"
    | "task_all"
    | "create"
    | "complete"
    | "today"
    | "cost"
    | "report"
    | "import"
    | "files"
    | "file_notes"
    | "project"
    | "project_switch"
    | "search"
    | "delete"
    | "update"
    | "assign"
    | "my"
    | "register"
    | "login_pw" // 用户名+密码注册/登录
    | "help"
    | "unknown";
  args: string;
  taskId?: number;
  fileId?: number;
}

export function parseCommand(text: string): ParsedCommand {
  const input = text.trim();
  let clean = input.replace(/^@\S+\s*/, "").trim();
  clean = clean.replace(/^[!！\/]\s*/, "").trim();

  // 帮助
  if (/^(帮助|help|h|命令|commands)$/i.test(clean))
    return { action: "help", args: "" };

  // === 注册 / 登录 ===
  const registerMatch = clean.match(
    /^(注册|register|signup)\s+(\S+)\s+(.{6,})/i
  );
  if (registerMatch)
    return {
      action: "register",
      args: `${registerMatch[2]}|||${registerMatch[3].trim()}`,
    };

  const loginPwMatch = clean.match(/^(登录|login|signin)\s+(\S+)\s+(.{6,})/i);
  if (loginPwMatch)
    return {
      action: "login_pw",
      args: `${loginPwMatch[2]}|||${loginPwMatch[3].trim()}`,
    };

  // 任务列表
  if (/^(任务|tasks|task|待办|todo)$/i.test(clean))
    return { action: "tasks", args: "" };
  if (/^(任务|tasks|task)\s+(全部|all|所有|full)$/i.test(clean))
    return { action: "task_all", args: "" };

  // 创建
  const createMatch = clean.match(/^(创建|create|add|new)\s+(.+)/i);
  if (createMatch) return { action: "create", args: createMatch[2].trim() };

  // 完成
  const doneMatch = clean.match(/^(完成|done|close|finish|resolve)\s+#?(\d+)/i);
  if (doneMatch)
    return { action: "complete", args: "", taskId: parseInt(doneMatch[2], 10) };

  // 今日
  if (/^(今日|today|到期|due)\s*$/i.test(clean))
    return { action: "today", args: "" };

  // 我的
  if (/^(我的|my|mine)\s*$/i.test(clean)) return { action: "my", args: "" };

  // 搜索
  const searchMatch = clean.match(/^(搜索|search|查|find)\s+(.+)/i);
  if (searchMatch) return { action: "search", args: searchMatch[2].trim() };

  // 删除
  const delMatch = clean.match(/^(删除|delete|del|remove|rm)\s+#?(\d+)/i);
  if (delMatch)
    return { action: "delete", args: "", taskId: parseInt(delMatch[2], 10) };

  // 更新
  const updMatch = clean.match(/^(更新|update|edit|修改)\s+#?(\d+)\s+(.+)/i);
  if (updMatch)
    return {
      action: "update",
      args: updMatch[3].trim(),
      taskId: parseInt(updMatch[2], 10),
    };

  // 指派
  const assignMatch = clean.match(/^(指派|assign|交给)\s+#?(\d+)\s+(.+)/i);
  if (assignMatch)
    return {
      action: "assign",
      args: `${assignMatch[2]}|||${assignMatch[3].trim()}`,
    };

  // 成本
  const costMatch = clean.match(
    /^(成本|cost|expense)\s+(\d+(\.\d{1,2})?)\s+(.+)/i
  );
  if (costMatch)
    return { action: "cost", args: `${costMatch[2]}|||${costMatch[4].trim()}` };
  const costAddMatch = clean.match(
    /^(成本|cost)\s+(add|添加)\s+(\d+(\.\d{1,2})?)\s+(.+)/i
  );
  if (costAddMatch)
    return {
      action: "cost",
      args: `${costAddMatch[3]}|||${costAddMatch[5].trim()}`,
    };
  if (/^(成本|cost)\s+(统计|stats|汇总|报告)\s*$/i.test(clean))
    return { action: "report", args: "" };

  // 报表
  if (/^(报表|report|统计|stats|周报|汇总)$/i.test(clean))
    return { action: "report", args: "" };

  // 导入
  const importMatch = clean.match(/^(导入|import|批量)\s*(.+)?/i);
  if (importMatch)
    return { action: "import", args: (importMatch[2] || "").trim() };

  // 文件（支持类型筛选：/文件 PDF、/文件 图片 等）
  if (
    /^(文件|files|file|附件)\s*$/i.test(clean) ||
    /^(文件|files)\s+(统计|stats|列表|list)\s*$/i.test(clean)
  )
    return { action: "files", args: "" };
  const ftypeMatch = clean.match(
    /^(文件|files)\s+(pdf|图片|image|excel|表格|doc|文档|word|其他|other)\s*$/i
  );
  if (ftypeMatch) return { action: "files", args: ftypeMatch[2] };
  const fnMatch = clean.match(
    /^(文件|file)\s+(备注|notes?|note)\s+#?(\d+)\s*(.+)?/i
  );
  if (fnMatch)
    return {
      action: "file_notes",
      args: (fnMatch[4] || "").trim(),
      fileId: parseInt(fnMatch[3], 10),
    };

  // 项目
  if (
    /^(项目|projects?|project)\s*$/i.test(clean) ||
    /^(项目|projects?)\s+(列表|list|全部|all)\s*$/i.test(clean)
  )
    return { action: "project", args: "" };
  const psMatch = clean.match(
    /^(项目|project)\s+(切换|switch|use|进入)\s+#?(\d+)/i
  );
  if (psMatch)
    return {
      action: "project_switch",
      args: "",
      taskId: parseInt(psMatch[3], 10),
    };

  return { action: "unknown", args: clean };
}
