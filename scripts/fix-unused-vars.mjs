/**
 * fix-unused-vars.mjs — 自动修复 @typescript-eslint/no-unused-vars 警告
 * 策略:
 *   1. 未使用的 import → 从 import 语句中移除
 *   2. 未使用的变量 → 前缀 _ 或删除赋值
 *   3. 未使用的参数 → 前缀 _
 * 使用: node scripts/fix-unused-vars.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// 1. 获取 ESLint JSON
console.log("[fix] Running ESLint...");
const eslintOut = execSync(
  "npx eslint client/ server/ scripts/ --ext .ts,.tsx,.mjs --format json --max-warnings 999",
  { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
);
const results = JSON.parse(eslintOut);

// 2. 按文件分组 unused-var 警告
const fileIssues = new Map();
for (const f of results) {
  const issues = f.messages.filter(
    m => m.severity === 1 && m.ruleId === "@typescript-eslint/no-unused-vars"
  );
  if (issues.length > 0) {
    fileIssues.set(f.filePath, {
      lines: readFileSync(f.filePath, "utf8").split("\n"),
      issues,
    });
  }
}

// 3. 处理每个文件
let fixed = 0;
for (const [filePath, { lines, issues }] of fileIssues) {
  const short = filePath.replace(root, "");

  for (const issue of issues) {
    const lineIdx = issue.line - 1;
    const line = lines[lineIdx];
    const varName = extractVarName(issue.message);

    if (!varName) continue;

    if (
      issue.message.includes("is defined but never used") &&
      isLikelyImport(line, varName)
    ) {
      // 未使用的 import → 移除
      const newLine = removeImportFromLine(line, varName);
      if (newLine !== line) {
        lines[lineIdx] = newLine;
        fixed++;
        console.log(`  ${short}:${issue.line} REMOVED import ${varName}`);
      }
    } else if (issue.message.includes("is assigned a value but never used")) {
      // 未使用的变量 → 前缀 _
      const re = new RegExp(
        `\\b(${escapeRegex(varName)})\\b(?![\\s\\S]*\\b${escapeRegex(varName)}\\b)`
      );
      // 简单方案: 在变量名前面加 _
      // 但可能影响其他引用，更安全的做法是只在定义处改名
      // 这里只处理简单的 let/const 声明
      if (/\b(let|const)\s/.test(line)) {
        lines[lineIdx] = line.replace(
          new RegExp(`\\b(let|const)\\s+${escapeRegex(varName)}\\b`),
          `$1 _${varName}`
        );
        fixed++;
        console.log(
          `  ${short}:${issue.line} PREFIXED var ${varName} → _${varName}`
        );
      }
    } else if (
      issue.message.includes("is defined but never used") &&
      issue.message.includes("Allowed unused args")
    ) {
      // 未使用的参数 → 前缀 _
      lines[lineIdx] = line.replace(
        new RegExp(`\\b${escapeRegex(varName)}\\b`),
        `_${varName}`
      );
      fixed++;
      console.log(
        `  ${short}:${issue.line} PREFIXED arg ${varName} → _${varName}`
      );
    }
  }

  writeFileSync(filePath, lines.join("\n"));
}

console.log(`\n[fix] Fixed ${fixed} issues across ${fileIssues.size} files`);

// --- helpers ---

function extractVarName(message) {
  // "'X' is defined but never used." or "'X' is assigned a value but never used."
  const m = message.match(/'([^']+)'/);
  return m ? m[1] : null;
}

function isLikelyImport(line, varName) {
  return line.includes("import") && line.includes(varName);
}

function removeImportFromLine(line, varName) {
  // 处理多种 import 格式
  const patterns = [
    // import { A, B, C } from "x" → 移除 A, 或 B
    new RegExp(`\\s*${escapeRegex(varName)}\\s*,?\\s*`),
    // import { A } from "x" → 如果只剩这一个，删整行
  ];

  let newLine = line.replace(patterns[0], match => {
    // 如果移除后 import {} 为空，标记需删除整行
    return "";
  });

  // 清理: 处理逗号残留 { , B } → { B } 或 { B, } → { B }
  newLine = newLine.replace(/{\s*,/, "{ ").replace(/,\s*}/, " }");
  // 如果变成 import {} from → 删除整行
  if (newLine.includes("import {") && newLine.match(/{\s*}/)) {
    return null; // 标记删除
  }

  // 如果只剩 , → 双逗号修复
  newLine = newLine.replace(/,\s*,/g, ",");

  return newLine;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
