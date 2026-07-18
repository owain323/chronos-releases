// 数据库入口 — 模块化后统一 re-export
// 外部 import * as db from "../db" 继续可用，无破坏性变更
export { db, getDb } from "./connection";
export * from "./users";
export * from "./projects";
export * from "./tasks";
export * from "./files";
export * from "./partners";
export * from "./finance";
export * from "./accounting";
export * from "./financial-reports";
export * from "./dashboard";
export * from "./webhooks";
export * from "./bot";
export * from "./workspaces";
export * from "./ai";
export * from "./ai_execution_logs";
