import { db, eq } from "./connection";
import { inArray } from "drizzle-orm";
import { workspaces, workspaceMembers } from "../../drizzle/schema";

export async function getWorkspaceBySlug(slug: string) {
  return db.select().from(workspaces).where(eq(workspaces.slug, slug)).get();
}

export async function getWorkspacesByUserId(userId: number) {
  const memberships = db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .all();
  if (memberships.length === 0) return [];
  const ids = memberships.map(m => m.workspaceId);
  return db.select().from(workspaces).where(inArray(workspaces.id, ids)).all();
}

export async function createWorkspace(data: {
  name: string;
  slug: string;
  createdBy: number;
}) {
  const result = db.insert(workspaces).values(data).run();
  const ws = db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, data.slug))
    .get();
  if (ws) {
    db.insert(workspaceMembers)
      .values({ workspaceId: ws.id, userId: data.createdBy, role: "admin" })
      .run();
  }
  return result;
}

export async function addWorkspaceMember(
  workspaceId: number,
  userId: number,
  role = "member"
) {
  return db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role })
    .run();
}

export async function removeWorkspaceMember(id: number) {
  return db.delete(workspaceMembers).where(eq(workspaceMembers.id, id)).run();
}

export async function getWorkspaceMembers(workspaceId: number) {
  return db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .all();
}
