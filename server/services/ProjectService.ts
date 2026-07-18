/**
 * ProjectService — 项目业务逻辑层
 */
import * as db from "../db";
import { recordAudit } from "../lib/audit";

export async function createProject(
  input: { name: string; description?: string; visibility?: string },
  userId: number,
  workspaceId: number
) {
  const result = await db.createProject({
    name: input.name,
    description: input.description,
    ownerId: userId,
    workspaceId,
  } satisfies {
    name: string;
    description?: string;
    ownerId: number;
    workspaceId: number;
  });
  // Drizzle SQLite insert returns { lastInsertRowid, ... }
  const project = result as unknown as {
    id: number;
    name: string;
    workspaceId: number;
    ownerId: number;
  };
  const pid =
    project?.id ?? (result as { lastInsertRowid: number }).lastInsertRowid ?? 0;
  recordAudit({ userId, action: "create", entity: "project", entityId: pid });
  return project;
}
