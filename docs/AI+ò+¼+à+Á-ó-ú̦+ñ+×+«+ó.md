# TaskNest AI 协作规范

> ⚠️ **通读全文后再动手。** 这不是建议，是前人踩坑总结的硬规矩。
> 📝 **本文档是公共协作规范。** 所有 AI（WorkBuddy、Kimi、Codex 等）均可增补。如果踩了新坑、发现新规则，直接加进来并 git commit，附上你的署名和日期。
>
> **修订记录：**
>
> - 2026-07-09 WorkBuddy — 新增三层工程质量防线（Husky pre-commit + GitHub Actions CI）、强制 `tsc --noEmit` 零错误规则、GitHub 仓库配置说明
> - 2026-07-09 Kimi — 补充"改公共模块后搜索引用"、"提交前过 diff"、"不要加未验证依赖"、"新增 schema 表必须建表"规则，更新踩坑速查表，标记改进指南 1-10 已完成。

---

## 一、项目概览

TaskNest 是团队任务管理 Web 应用，技术栈：

| 层      | 技术                                            |
| ------- | ----------------------------------------------- |
| 前端    | React 19 + Vite 7 + Tailwind CSS 4              |
| 后端    | Express 4 + tRPC 11                             |
| 数据库  | SQLite (better-sqlite3)，本地文件 `tasknest.db` |
| 类型    | TypeScript，通过 tRPC 实现前后端类型共享        |
| UI 组件 | shadcn/ui 全家桶（`client/src/components/ui/`） |

**访问地址：** http://localhost:3000/

---

## 二、分工规则

**一次只能改自己的目录，不要越界。**

| AI                    | 负责范围       | 文件路径                                          |
| --------------------- | -------------- | ------------------------------------------------- |
| WorkBuddy             | 后端 + 数据库  | `server/` 全部                                    |
| 其他 AI（例如 Kimi）  | 前端页面       | `client/src/pages/` 全部                          |
| 其他 AI（例如 Codex） | UI 组件 + 样式 | `client/src/components/` + `client/src/index.css` |

**例外：**

- `server/routers.ts` 和 `client/src/App.tsx` —— 如果要在前后端之间加新路由，告诉我（WorkBuddy），我来补。
- `drizzle/schema.ts` —— 如果要加新表，告诉我，我来加。

---

## 三、开工前必须做的事

### 1. 确认自己是谁，负责什么

看上面的分工表，不要碰别人的文件。

### 2. 查 git 状态

```bash
git log --oneline -5
```

这能告诉你当前项目处于什么状态，有没有其他 AI 刚刚提交了改动。

### 3. 确认服务在跑

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

输出应该是 `200`。如果不是，告诉我（WorkBuddy）。

### 4. 说清楚你要做什么

**在开工前跟我（WorkBuddy）汇报一句话：**

> "我要改 XXX 文件的 YYY 功能"

我来确认是否冲突，确认后你再动手。

---

## 四、改代码的规矩

### 1. 不要动这些文件

```
drizzle.config.ts          # 数据库配置
.env                       # 环境变量
vite.config.ts             # 构建配置
server/_core/context.ts    # 认证逻辑（当前无认证模式）
server/_core/trpc.ts       # tRPC 初始化
package.json               # 依赖和脚本
```

### 2. 数据库只能读不能改

- ✅ 通过 `server/db.ts` 中的现有函数查询数据
- ✅ 通过 tRPC 路由调用 `server/db.ts` 的函数
- ❌ 不要直接修改 `drizzle/schema.ts` 的已有表结构
- ❌ 不要改 `tasknest.db`
- ❌ 不要把 SQLite（better-sqlite3）改成 MySQL 或其他数据库

### 3. 写 TypeScript，不要用 any

项目有 tRPC 提供端到端类型安全，用 `any` 等于浪费。

❌ 坏：

```typescript
interface Props {
  vendor: any;
}
```

✅ 好：

```typescript
interface Props {
  vendor: { id: number; name: string; description?: string };
}
```

### 4. 改完立刻验证

```bash
# 确认服务没挂
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

如果输出不是 `200`，说明改出 bug 了。**撤回改动：**

```bash
git checkout -- <你改的文件路径>
```

### 5. 改公共模块后搜索引用

`server/db.ts`、`server/routers.ts`、`drizzle/schema.ts` 是公共模块，改导出/签名后必须全局搜索所有 import 引用方，确认没有语法错误再提交。

```bash
grep -rn "你改的函数名或导出" client/src/ server/
```

### 6. 提交前过 diff，检查重复/残留代码

```bash
git diff --cached
```

重点看：

- 有没有重复粘贴的代码块（之前发生过 routers.ts 中 analytics 路由重复定义）
- JSX 中有没有残留的字符串字面量（如 `</div>"p-4...`）
- 新增的 import 是否真的能 resolve

### 7. 不要加未验证的依赖

加新 npm 包前，先确认 Vite dev server 能正常 resolve。试加一行 `import X from "xxx"`，看终端是否报错。

- ❌ `xlsx` 包年久失修，ESM 入口指向不存在的文件，不要用
- ✅ 项目已有 `exceljs`，Excel 导出用它

### 8. 提交前必须过类型检查 🚨

**改代码不改到 tsc 无报错，等于没改完。**

```bash
npx tsc --noEmit
```

- 必须输出 **空**（零错误），才允许提交
- ❌ 不要用 `as any` 绕过类型错误（`TaskList.tsx` 中的 `formData.priority as any` 是特殊例外，因为有 Zod schema 运行时校验兜底）
- ❌ 不要删掉错误调用完事（如删掉一整段 mutation），要么修好、要么加 TODO 注释标注"功能开发中"
- 如果改动了 `server/` 目录，还需要 `npm run dev` 确认服务能启动

> **WorkBuddy 注（2026-07-09）：** 这条规则今天刚加。之前 32 个类型错误裸奔了不知道多久，今天修到了零。以后每犯一回，你浪费的不只是自己的时间，还有审核者的时间。
>
> **教训：** DB 层被换 MySQL 又换回来、JSX 语法错误、ctx.user null 访问——这些问题本可以被 `tsc --noEmit` 在 3 秒内拦截，但因为没人跑，拖到服务崩溃才发现。

### 9. 提交到 git

```bash
git add -A
git commit -m "类型：描述"
```

**提交信息必须是中文，格式：** `类型：描述`

- 例：`修复：文件管理页删除按钮加确认弹窗`
- 例：`新增：供应商管理页添加编辑功能`

---

## 四、工程质量防线（三层）

> ⚠️ 这三层防线是工具化约束，不是"建议"。任何一层不通过，代码就不能进仓库。

### Layer 1 — 手动检查

```bash
npm run check   # tsc --noEmit，必须零错误
npm run test    # vitest run，必须全绿
```

### Layer 2 — Pre-commit 钩子（本地自动拦）

每次 `git commit` 自动触发，无需手动运行：

1. `tsc --noEmit --skipLibCheck` → 不通过拦截提交
2. `vitest run --passWithNoTests` → 不通过拦截提交

配置位置：`.husky/pre-commit` + `package.json` 中 `lint-staged` 段

### Layer 3 — GitHub Actions CI（远程自动拦）

每次 push 到 `main` 分支自动触发：

1. `npm install --legacy-peer-deps`
2. `npx tsc --noEmit`
3. `npx vitest run`

配置位置：`.github/workflows/ci.yml`

**仓库地址：** https://github.com/owain323/TaskNest

**如果被拦了怎么办：**

1. 看终端报错，定位到具体文件和行号
2. 修好类型错误或测试失败
3. 重新 `git add && git commit`

> **WorkBuddy 注（2026-07-09）：** 这套体系是今天从零搭起来的。之前 32 个 TypeScript 错误裸奔了不知多久，测试也只有一个跑不通的文件。现在 13 tests 全绿 + tsc 零错误 + 三层防线。以后谁再说"我改完了"但类型报错，commit 都打不进去，不用肉眼审核了。

---

## 五、绝对禁止的操作

1. ❌ **不要动 `tasknest.db`** —— 里面有真实用户数据（导入的供应商等）
2. ❌ **不要改 `drizzle.config.ts`** —— 数据库配置不能变
3. ❌ **不要把 SQLite 改成 MySQL 或任何其他数据库**
4. ❌ **不要在 `server/db.ts` 的已有函数中改函数签名** —— 其他地方可能依赖这些签名
5. ❌ **不要直接调用 `better-sqlite3` 原生 API** —— 统一通过 `server/db.ts` 做数据操作
6. ❌ **不要改 `server/_core/context.ts` 中的 `DEFAULT_USER`**
7. ❌ **不要自己重启服务** —— 只有在改了 `server/` 下的文件时才需要重启，告诉我我来做
8. ❌ **不要碰端口相关代码** —— 端口已固定为 3000
9. ❌ **改了 `drizzle/schema.ts` 不等于数据库就有了** —— Drizzle schema 只是类型定义，新增表后必须执行 `CREATE TABLE IF NOT EXISTS` 或用 drizzle-kit 推送到数据库，否则查询时表不存在会报错

---

## 五-B、模块评审清单

每次开发完后，在 `git commit` 之前，对照 `REVIEW_CHECKLIST.md` 逐项检查：

1. 有没有重复代码？
2. 有没有破坏模块边界？
3. 有没有把业务逻辑写进组件？
4. 有没有新增技术债？

自动化（tsc + vitest + prettier）拦语法错误，这个清单拦设计问题。两者缺一不可。

---

## 六、踩坑速查表

这是之前合作中遇到的真实问题，别再踩：

| 问题                     | 表现                                                   | 原因                                                | 预防                                    |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------- |
| 数据库被改回 MySQL       | 所有 API 返回 `ECONNREFUSED`                           | 把 `better-sqlite3` 改成了 `drizzle-orm/mysql2`     | 不改 `server/db.ts` 的数据库初始化部分  |
| 分析面板报错             | 页面白屏、控制台 Uncaught error                        | 前端调 `analytics.getProjectStats` 但后端没这个路由 | 加前端调用前确认后端路由存在            |
| 搜索服务崩溃             | 服务启动报 `SyntaxError: does not export 'isMemoryDb'` | 改了 `db.ts` 的导出，但 `search.ts` 引用了旧导出    | 改公共模块后搜索引用                    |
| xlsx 包加载失败          | Vite 报 `Failed to resolve entry for package "xlsx"`   | npm 版的 `xlsx` 包 ESM 入口指向不存在的文件         | 加新依赖前确认 Vite 能正常 resolve      |
| 拖拽功能用不了           | 看板任务点不动                                         | 只有 CSS `cursor-grab`，没装拖拽库                  | 功能要落实，不是只写 CSS                |
| 新增表查询报错           | `SQLITE_ERROR: no such table`                          | 改了 `drizzle/schema.ts` 但没在数据库中建表         | schema 改完必须执行建表语句或 migration |
| 重复代码块导致运行时异常 | 服务启动报 `Unexpected ":"` 或 `Unexpected "}"`        | 编辑时重复粘贴了代码块，覆盖了函数签名              | 提交前过 diff，检查是否有重复代码       |
| 上传文件后重复选不了     | 再次点击上传没反应                                     | 上传成功后没清空 `<input>` 的 `value`               | `finally` 里加 `e.target.value = ""`    |

---

## 七、当前任务列表

`改进指南.md` 中的任务 1-10（Analytics 路由修复、Dashboard 统计、Bookkeeping 事务保护、清理死代码、文件预览链接、删除确认、上传重置、import 清理、易用性改进、搜索 debounce）已全部完成。

后续新需求或 bug 修复，按以下流程：

1. 确认需求范围和优先级
2. 确认在自己负责的文件范围内
3. **告诉我你要做哪个任务**，确认不冲突
4. 做完提交 git，我再检查

---

## 八、快速参考

```bash
# 项目目录
cd /c/Users/czj17751/WorkBuddy/2026-07-08-17-43-56/TaskNest

# 检查服务
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/

# 看最近的改动
git log --oneline -5

# 看你改了什么
git diff

# 提交你的改动
git add -A && git commit -m "类型：描述"

# 如果改坏了，撤回
git checkout -- 文件路径

# 如果是 server 文件改了要重启，告诉我：WorkBuddy，需要重启服务
```
