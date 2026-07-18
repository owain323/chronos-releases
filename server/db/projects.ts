import { db, eq } from "./connection";
import { inArray, not, and } from "drizzle-orm";
import {
  projects,
  projectMembers,
  kanbanColumns,
  milestones,
} from "../../drizzle/schema";

// Projects
export async function getAllProjects() {
  return db.select().from(projects).all();
}
export async function getProjectsByUserId(
  userId: number,
  workspaceId?: number | null,
  userRole?: string | null
) {
  // 查到用户的 member 记录
  const memberProjectIds = db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId))
    .all()
    .map(m => m.projectId);

  const conditions = [not(inArray(projects.status, ["deleted", "archived"]))];
  if (workspaceId) {
    conditions.push(eq(projects.workspaceId, workspaceId));
  }
  const allProjects = db
    .select()
    .from(projects)
    .where(and(...conditions))
    .all();

  // admin/owner/member 看到 workspace 内所有项目
  if (userRole === "owner" || userRole === "admin" || userRole === "member") {
    return allProjects;
  }

  // member/viewer: 只有自己的 + 成员 + org 可见
  return allProjects.filter(
    p =>
      p.ownerId === userId ||
      memberProjectIds.includes(p.id) ||
      p.visibility === "org"
  );
}
export async function getProjectById(projectId: number) {
  const result = db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}

export function updateProject(
  projectId: number,
  data: { name: string; description?: string | null }
) {
  return db
    .update(projects)
    .set({
      name: data.name,
      description: data.description ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, projectId))
    .run();
}

export function archiveProject(projectId: number) {
  return db
    .update(projects)
    .set({
      status: "deleted",
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(projects.id, projectId))
    .run();
}

export function transferProjectOwnership(
  projectId: number,
  newOwnerId: number
) {
  return db
    .update(projects)
    .set({ ownerId: newOwnerId, updatedAt: new Date().toISOString() })
    .where(eq(projects.id, projectId))
    .run();
}

export async function createProject(data: {
  name: string;
  description?: string;
  ownerId: number;
  workspaceId?: number;
}) {
  return db
    .insert(projects)
    .values({
      name: data.name,
      description: data.description ?? null,
      ownerId: data.ownerId,
      workspaceId: data.workspaceId ?? 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .run();
}

// Kanban columns
export async function getKanbanColumnsByProjectId(projectId: number) {
  return db
    .select()
    .from(kanbanColumns)
    .where(eq(kanbanColumns.projectId, projectId))
    .all();
}
export async function createKanbanColumn(data: {
  projectId: number;
  name: string;
  order: number;
}) {
  return db
    .insert(kanbanColumns)
    .values({ ...data, createdAt: new Date().toISOString() })
    .run();
}

// Project members
export async function getProjectMembers(projectId: number) {
  return db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
    .all();
}
export async function addProjectMember(data: {
  projectId: number;
  userId: number;
  role: "owner" | "manager" | "member";
  phone?: string;
  notes?: string;
}) {
  return db
    .insert(projectMembers)
    .values({
      projectId: data.projectId,
      userId: data.userId,
      role: data.role,
      phone: data.phone || null,
      notes: data.notes || null,
      joinedAt: new Date().toISOString(),
    })
    .run();
}
export async function updateProjectMember(
  id: number,
  data: { role?: string; phone?: string; notes?: string }
) {
  return db
    .update(projectMembers)
    .set(data)
    .where(eq(projectMembers.id, id))
    .run();
}
export async function deleteProjectMember(id: number) {
  return db.delete(projectMembers).where(eq(projectMembers.id, id)).run();
}

export async function getProjectMemberById(id: number) {
  return db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.id, id))
    .get();
}

// Milestones
export async function getMilestonesByProjectId(projectId: number) {
  return db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .all();
}
export async function createMilestone(data: {
  projectId: number;
  title: string;
  description?: string;
  dueDate: Date;
}) {
  const now = new Date().toISOString();
  return db
    .insert(milestones)
    .values({
      projectId: data.projectId,
      title: data.title,
      description: data.description ?? null,
      dueDate:
        data.dueDate instanceof Date
          ? data.dueDate.toISOString()
          : String(data.dueDate),
      completed: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

export async function updateMilestone(
  id: number,
  data: {
    title?: string;
    description?: string;
    dueDate?: Date;
    completed?: boolean;
  }
) {
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.dueDate !== undefined)
    updates.dueDate =
      data.dueDate instanceof Date
        ? data.dueDate.toISOString()
        : String(data.dueDate);
  if (data.completed !== undefined) updates.completed = data.completed ? 1 : 0;
  return db.update(milestones).set(updates).where(eq(milestones.id, id)).run();
}

export async function deleteMilestone(id: number) {
  return db.delete(milestones).where(eq(milestones.id, id)).run();
}
