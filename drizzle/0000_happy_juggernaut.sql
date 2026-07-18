CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`parentId` integer,
	`cashFlowCategory` text,
	`balance` real DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`workspace_id` integer,
	`session_id` text,
	`source` text DEFAULT 'USER' NOT NULL,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`level` text DEFAULT 'INFO' NOT NULL,
	`metadata` text,
	`ip_address` text,
	`request_id` text,
	`status` text DEFAULT 'SUCCESS' NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `ai_execution_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text DEFAULT 'v1' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`error` text,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`workspaceId` integer NOT NULL,
	`projectId` integer,
	`status` text DEFAULT 'planning' NOT NULL,
	`plan` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`prompt_version` text DEFAULT 'v1' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`created_via` text DEFAULT 'AI' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` integer NOT NULL,
	`projectId` integer,
	`userId` integer NOT NULL,
	`action` text(20) NOT NULL,
	`entity` text(50) NOT NULL,
	`entityId` integer NOT NULL,
	`changes` text,
	`ip` text(50),
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_auth_codes` (
	`code` text(6) PRIMARY KEY NOT NULL,
	`chronosUserId` integer NOT NULL,
	`expiresAt` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_user_context` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text(20) NOT NULL,
	`platformUserId` text(128) NOT NULL,
	`chronosUserId` integer NOT NULL,
	`currentProjectId` integer DEFAULT 1 NOT NULL,
	`lastCommand` text,
	`tempData` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`accountId` integer NOT NULL,
	`period` text NOT NULL,
	`amount` real NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_projectId_accountId_period_unique` ON `budgets` (`projectId`,`accountId`,`period`);--> statement-breakpoint
CREATE TABLE `closings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`period` text NOT NULL,
	`closedBy` integer NOT NULL,
	`netIncome` real NOT NULL,
	`entryCount` integer NOT NULL,
	`summary` text,
	`closedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `closings_projectId_period_unique` ON `closings` (`projectId`,`period`);--> statement-breakpoint
CREATE TABLE `costEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`amount` real NOT NULL,
	`category` text(100) NOT NULL,
	`notes` text,
	`vendorId` integer,
	`date` text NOT NULL,
	`createdBy` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customerContacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customerId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`phone` text(20),
	`landline` text(20),
	`email` text(320),
	`role` text DEFAULT 'other' NOT NULL,
	`notes` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expenseEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`amount` real NOT NULL,
	`category` text(100) NOT NULL,
	`notes` text,
	`date` text NOT NULL,
	`createdBy` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`type` text DEFAULT 'boolean' NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`percentage` real DEFAULT 0,
	`whitelist` text,
	`env_filter` text DEFAULT 'all' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feature_flags_key_unique` ON `feature_flags` (`key`);--> statement-breakpoint
CREATE TABLE `fileSnapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer,
	`projectId` integer,
	`fileName` text(255) NOT NULL,
	`fileKey` text(255) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileSize` integer,
	`mimeType` text(100),
	`uploadedBy` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`notes` text,
	`recordDate` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `journalEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`debitAccountId` integer NOT NULL,
	`debitAmount` real NOT NULL,
	`creditAccountId` integer NOT NULL,
	`creditAmount` real NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kanbanColumns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`order` integer NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`title` text(255) NOT NULL,
	`description` text,
	`dueDate` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`userId` integer NOT NULL,
	`type` text(50) NOT NULL,
	`title` text(255) NOT NULL,
	`body` text,
	`link` text(512),
	`read` integer DEFAULT false NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource` text(50) NOT NULL,
	`action` text(50) NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `projectMembers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`userId` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`phone` text(20),
	`notes` text,
	`joinedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`workspaceId` integer DEFAULT 0 NOT NULL,
	`ownerId` integer NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`archivedAt` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revenueEntries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`amount` real NOT NULL,
	`category` text(100) NOT NULL,
	`notes` text,
	`customerId` integer,
	`date` text NOT NULL,
	`createdBy` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text(20) NOT NULL,
	`permissionId` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subtasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`title` text(255) NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `taskComments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`authorId` integer NOT NULL,
	`content` text NOT NULL,
	`mentions` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`columnId` integer NOT NULL,
	`title` text(255) NOT NULL,
	`description` text,
	`assigneeId` integer,
	`creatorId` integer NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`dueDate` text,
	`completedAt` text,
	`order` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`session_id_hash` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`device` text,
	`login_at` integer,
	`last_active_at` integer,
	`logout_at` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text(64) NOT NULL,
	`name` text,
	`email` text(320),
	`loginMethod` text(64),
	`role` text DEFAULT 'user' NOT NULL,
	`passwordHash` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`lastSignedIn` text NOT NULL,
	`resetTokenHash` text,
	`resetTokenExpiresAt` text,
	`tokenVersion` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE TABLE `vendorContacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendorId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`phone` text(20),
	`landline` text(20),
	`email` text(320),
	`role` text DEFAULT 'other' NOT NULL,
	`notes` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`description` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`projectId` integer NOT NULL,
	`name` text(255) NOT NULL,
	`platform` text(64) NOT NULL,
	`webhookUrl` text(512) NOT NULL,
	`config` text,
	`enabled` integer DEFAULT true NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspaceId` integer NOT NULL,
	`userId` integer NOT NULL,
	`role` text(20) DEFAULT 'member' NOT NULL,
	`status` text(20) DEFAULT 'active' NOT NULL,
	`invitedBy` integer,
	`invitedAt` text,
	`joinedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(255) NOT NULL,
	`slug` text(64) NOT NULL,
	`createdBy` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`settings` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);