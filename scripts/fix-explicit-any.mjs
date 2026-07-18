/**
 * fix-explicit-any.mjs — 批量安全替换 no-explicit-any
 * 安全模式:
 *   1. catch (e: any) → catch
 *   2. .catch((err: any) => → .catch((err: unknown) =>
 * 使用: node scripts/fix-explicit-any.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// 1. Get ESLint JSON
console.log("[fix] Running ESLint...");
const eslintOut = execSync(
  "npx eslint client/ server/ scripts/ --ext .ts,.tsx,.mjs --format json --max-warnings 999",
  { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
);
const results = JSON.parse(eslintOut);

// 2. Group by file
const fileMap = new Map();
for (const f of results) {
  const issues = f.messages.filter(
    m => m.severity === 1 && m.ruleId === "@typescript-eslint/no-explicit-any"
  );
  if (issues.length > 0) {
    if (!fileMap.has(f.filePath)) fileMap.set(f.filePath, []);
    fileMap.get(f.filePath).push(...issues);
  }
}

// 3. Process each file
let totalFixed = 0;
for (const [filePath, issues] of fileMap) {
  const lines = readFileSync(filePath, "utf8").split("\n");
  const short = filePath.replace(root, "");
  let fileFixed = 0;

  for (const issue of issues) {
    const lineIdx = issue.line - 1;
    const line = lines[lineIdx];

    // Pattern 1: catch (e: any) → catch
    if (/catch\s*\(\s*\w+\s*:\s*any\s*\)/.test(line)) {
      lines[lineIdx] = line.replace(
        /catch\s*\(\s*\w+\s*:\s*any\s*\)/g,
        "catch"
      );
      fileFixed++;
    }
    // Pattern 2: .catch((err: any) => → .catch((err: unknown) =>
    else if (/\.catch\s*\(\s*\(\s*\w+\s*:\s*any\s*\)/.test(line)) {
      lines[lineIdx] = line.replace(
        /(\.catch\s*\(\s*\(\s*\w+\s*:\s*)any(\s*\))/g,
        "$1unknown$2"
      );
      fileFixed++;
    }
    // Pattern 3: as any → add eslint-disable comment (not safe to change)
    // Skip for now
  }

  if (fileFixed > 0) {
    writeFileSync(filePath, lines.join("\n"));
    totalFixed += fileFixed;
    console.log(`  ${short}: ${fileFixed} fixed`);
  }
}

console.log(`\n[fix] Total fixed: ${totalFixed}`);
