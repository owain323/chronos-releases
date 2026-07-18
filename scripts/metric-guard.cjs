#!/usr/bin/env node
/**
 * metric-guard — 防止指标工程的硬锁
 * 
 * 红线:
 * 1. ESLint 阈值不得凭空上涨 (除非同时削减实际 warning)
 * 2. 禁止无效测试骨架 (it.todo 需同步实现)
 * 3. 禁止阈值-only 提交 (改阈值不改代码 = 拒绝)
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const THRESHOLD_FILE = path.join(ROOT, ".eslint-threshold");

// 从 .eslint-threshold 读锁定值（避免硬编码）
let LOCKED_THRESHOLD;
try {
  const t = require(THRESHOLD_FILE);
  LOCKED_THRESHOLD = t.eslintThreshold;
} catch {
  LOCKED_THRESHOLD = 306; // fallback
}

// ═══════════════════ 1. ESLint 阈值硬锁 ═══════════════════

function checkThreshold() {
  // 读取 CI/workflow 和 package.json 中的阈值
  const ciFile = path.join(ROOT, ".github/workflows/ci.yml");
  const pkgFile = path.join(ROOT, "package.json");
  
  const ci = fs.readFileSync(ciFile, "utf8");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  
  // 从 ci.yml 提取阈值
  const ciMatch = ci.match(/--max-warnings\s+(\d+)/);
  const ciThreshold = ciMatch ? parseInt(ciMatch[1]) : 0;
  
  // 从 package.json 提取阈值
  const checkScript = pkg.scripts?.check || "";
  const pkgMatch = checkScript.match(/--max-warnings\s+(\d+)/);
  const pkgThreshold = pkgMatch ? parseInt(pkgMatch[1]) : 0;
  
  if (ciThreshold !== LOCKED_THRESHOLD) {
    console.error(`❌ CI 阈值 ${ciThreshold} ≠ 锁定值 ${LOCKED_THRESHOLD}`);
    console.error(`   文件: .github/workflows/ci.yml`);
    console.error(`   规则: 阈值不得改动。要升必须同时削减实际 warning 数量。`);
    process.exit(1);
  }
  
  if (pkgThreshold !== LOCKED_THRESHOLD) {
    console.error(`❌ package.json 阈值 ${pkgThreshold} ≠ 锁定值 ${LOCKED_THRESHOLD}`);
    process.exit(1);
  }
  
  console.log(`✅ ESLint 阈值锁定: ${LOCKED_THRESHOLD}`);
}

// ═══════════════════ 2. 禁止阈值-only 提交 ═══════════════════

function checkNoThresholdOnlyCommit() {
  try {
    // 检查 staged 文件中是否有阈值改动
    const staged = execSync("git diff --cached --name-only", { encoding: "utf8" });
    const stagedFiles = staged.trim().split("\n").filter(Boolean);
    
    const thresholdFiles = stagedFiles.filter(f => 
      f.includes("ci.yml") || f.includes("package.json")
    );
    
    if (thresholdFiles.length === 0) return; // 没有阈值相关文件改动
    
    // 检查是否有 source 文件改动 (削减 warning)
    const sourceFiles = stagedFiles.filter(f => 
      f.match(/\.(ts|tsx|mjs)$/) && !f.includes("test.") && !f.includes(".test.")
    );
    
    if (sourceFiles.length === 0) {
      console.error("❌ 拒绝: 仅修改阈值文件，没有改动源码");
      console.error("   阈值只能在削减实际 ESLint warning 时同步提升");
      console.error("   当前锁定值: " + LOCKED_THRESHOLD);
      process.exit(1);
    }
    
    console.log(`✅ 阈值修改伴随 ${sourceFiles.length} 个源码文件改动 — 允许`);
  } catch (e) {
    // Not a git repo — skip
  }
}

// ═══════════════════ 3. 禁止 it.todo() 增量 ═══════════════════
// 不卡存量 (用户授权当前 10 个 todo 暂存) — 只阻止新增

function checkTodoTests() {
  try {
    const staged = execSync("git diff --cached --name-only", { encoding: "utf8" });
    const stagedFiles = staged.trim().split("\n").filter(Boolean);
    const testFiles = stagedFiles.filter(f => f.match(/\.(test|spec)\.(ts|tsx)$/));
    
    if (testFiles.length === 0) return; // 没有 test 文件改动
    
    for (const f of testFiles) {
      if (!fs.existsSync(f)) continue;
      const current = fs.readFileSync(f, "utf8").match(/it\.todo/g) || [];
      const currentCount = current.length;
      
      try {
        const diff = execSync(`git diff --cached -- "${f}"`, { encoding: "utf8" });
        const added = diff.split("\n").filter(l => l.startsWith("+") && l.includes("it.todo")).length;
        const removed = diff.split("\n").filter(l => l.startsWith("-") && l.includes("it.todo")).length;
        const netAdd = added - removed;
        
        if (netAdd > 0) {
          console.error(`❌ ${f}: 新增 ${netAdd} 个 it.todo(), 必须同时实现或删除`);
          process.exit(1);
        }
        
        if (currentCount > 0) {
          console.log(`✅ ${f}: ${currentCount} 个 todo (基线保留, 不新增)`);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

// ═══════════════════ Main ═══════════════════

console.log("\n🔒 metric-guard v1 · 启动\n");

const checks = process.argv.slice(2);
const runAll = checks.length === 0;

if (runAll || checks.includes("threshold")) checkThreshold();
if (runAll || checks.includes("commit")) checkNoThresholdOnlyCommit();
if (runAll || checks.includes("todo")) checkTodoTests();

console.log("\n✅ 所有检查通过\n");
