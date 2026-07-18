-- Phase A 增量迁移 — 服务器版本（audit_logs 表可能不存在）

-- 1. workspaces
ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN settings TEXT;
ALTER TABLE workspaces ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '';

-- 2. workspace_members
ALTER TABLE workspace_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspace_members ADD COLUMN invitedBy INTEGER;
ALTER TABLE workspace_members ADD COLUMN invitedAt TEXT;

-- 3. projects
ALTER TABLE projects ADD COLUMN archivedAt TEXT;

-- 4. 数据补值
UPDATE workspaces SET updatedAt = COALESCE(updatedAt, '2026-01-01') WHERE updatedAt = '';
