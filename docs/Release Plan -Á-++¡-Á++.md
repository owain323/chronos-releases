# Release Plan Template

> 定位: 固定模板——每个版本计划从这开始。不删节。
> 创建: 2026-07-15 · v2.11 评审会议产物

---

## §1 · Goal（目标）

__一句话定位__。这版的成功标准不是用户感觉功能更多，而是后续开发更快。

---

## §2 · Scope / Non-Scope（范围）

### In Scope

### Not in Scope
❌

---

## §3 · Success Metrics（量化指标）

| 指标 | 当前 | 目标 |
|------|------|------|
| routers.ts | N 行 | <500 |
| any | N 处 | 0 |
| tests | N pass | N+ |
| build | — | 成功 |
| CI | — | green |

---

## §4 · Implementation Tasks（实施任务）

按依赖顺序排列。每阶段包含: __Done Definition__ + __Smoke Scope__。

### Task 1 — [标题]

**Done:**
- [ ] tsc 0 error
- [ ] test 全部通过
- [ ] 无新增 ESLint warning
- [ ] [具体验收标准]

**Smoke Scope:**
- 登录 → 创建 [X] → 验证 [Y]

---

### Task N — [标题]

[同上结构]

---

## §5 · Release Gate（发布门禁）

- [ ] tsc 0 error 0 warning
- [ ] ESLint 0 error
- [ ] test 全部通过
- [ ] build 成功
- [ ] CI green
- [ ] 所有 Task Done Definition 达标
- [ ] 无新增 any 警告

---

## §6 · Rollback Plan（回滚标准）

- [ ] 每个 Task 独立可回滚 (Git tag / commit)
- [ ] SQL 聚合保留旧实现一版 (Feature Flag 或 JS 实现)
- [ ] Router 拆分保持 API 签名不变
- [ ] 去重前打 Git Tag

---

## §7 · Risk（风险）

| Risk | Mitigation |
|------|-----------|
| [风险描述] | [缓解措施] |

---

## §8 · Post Release Review（发布复盘）

- 实际耗时 vs 预估
- 遇到的问题
- 哪些抽象值得保留
- 哪些拆分以后更难维护
- 供下一版使用

---

## §9 · Performance Observation（性能观察）

_观察项，非实施项——不做 Virtual List，只记录基线_

| 场景 | 5000 条表现 | 10000 条表现 | 备注 |
|------|-----------|------------|------|
| Dashboard | — | — | — |
| Search | — | — | — |
| File List | — | — | — |

---

> 使用方式: 复制此模板 → 填 Goal/Scope/Metrics → 拆 Task → 执行 → Gate → Review
