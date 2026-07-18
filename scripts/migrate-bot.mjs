import Database from "better-sqlite3";
const db = new Database(process.argv[2] || "./CHRONOS.db");

db.exec(`CREATE TABLE IF NOT EXISTS bot_user_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  platformUserId TEXT NOT NULL,
  chronosUserId INTEGER NOT NULL,
  currentProjectId INTEGER NOT NULL DEFAULT 1,
  lastCommand TEXT,
  tempData TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  UNIQUE(platform, platformUserId)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS bot_auth_codes (
  code TEXT PRIMARY KEY,
  chronosUserId INTEGER NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
)`);

console.log("bot_user_context: OK");
console.log("bot_auth_codes: OK");
