import Database from "better-sqlite3";
const db = new Database("/opt/CHRONOS/CHRONOS.db");
const rows = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log("Tables:", rows.map(r => r.name).join(", "));

// Check if bot tables exist
const hasBotCtx = rows.some(r => r.name === "bot_user_context");
const hasBotCodes = rows.some(r => r.name === "bot_auth_codes");
console.log("bot_user_context:", hasBotCtx ? "✅" : "❌");
console.log("bot_auth_codes:", hasBotCodes ? "✅" : "❌");

// Check if users table has data
const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get();
console.log("Users:", userCount.c);
