-- Phase A 数据地基迁移
-- 增量迁移：仅 ALTER ADD COLUMN，不删任何数据

-- 1. workspaces 表
ALTER TABLE workspaces ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspaces ADD COLUMN settings TEXT;
ALTER TABLE workspaces ADD COLUMN updatedAt TEXT NOT NULL DEFAULT (datetime('now'));

-- 2. workspace_members 表
ALTER TABLE workspace_members ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE workspace_members ADD COLUMN invitedBy INTEGER;
ALTER TABLE workspace_members ADD COLUMN invitedAt TEXT;

-- 3. projects 表
ALTER TABLE projects ADD COLUMN archivedAt TEXT;

-- 4. audit_logs 表
ALTER TABLE audit_logs ADD COLUMN workspaceId INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN projectId INTEGER;

-- 5. 数据迁移：现有数据的补值
--    所有现有 workspace 的 status 设为 'active'（已有 DEFAULT）
--    所有现有 member 的 status 设为 'active'（已有 DEFAULT）
--    tokenVersion 已存在，无需迁移
--    visibility 已存在（之前的 migration-visibility.sql 已补），无需迁移

-- 6. 索引
CREATE INDEX IF NOT EXISTS idx_wm_wid_uid ON workspace_members(workspaceId, userId);
CREATE INDEX IF NOT EXISTS idx_wm_wid_status ON workspace_members(workspaceId, status);
CREATE INDEX IF NOT EXISTS idx_proj_wid_vis ON projects(workspaceId, visibility);
CREATE INDEX IF NOT EXISTS idx_audit_wid_ca ON audit_logs(workspaceId, createdAt);
