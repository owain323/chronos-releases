-- Migration: bot_inbox table for v4.0 bot file ingest
-- v3.9 flaky-gate lesson: must be idempotent (IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS bot_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_user_id TEXT NOT NULL,
  web_user_id INTEGER,
  workspace_id INTEGER,
  project_id INTEGER,
  original_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  temp_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  committed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bot_inbox_bot_user ON bot_inbox(bot_user_id, status);
CREATE INDEX IF NOT EXISTS idx_bot_inbox_expires ON bot_inbox(expires_at, status);
