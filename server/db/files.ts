import { db, eq } from "./connection";
import { fileSnapshots } from "../../drizzle/schema";

// File Snapshots
export async function getFileSnapshotById(id: number) {
  const r = db
    .select()
    .from(fileSnapshots)
    .where(eq(fileSnapshots.id, id))
    .limit(1)
    .all();
  return r[0] || null;
}
export async function getFileSnapshotsByTaskId(taskId: number) {
  return db
    .select()
    .from(fileSnapshots)
    .where(eq(fileSnapshots.taskId, taskId))
    .all();
}
export async function getFileSnapshotsByProjectId(projectId: number) {
  return db
    .select()
    .from(fileSnapshots)
    .where(eq(fileSnapshots.projectId, projectId))
    .all();
}
export async function createFileSnapshot(data: {
  taskId?: number;
  projectId?: number;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: number;
  recordDate?: string;
}) {
  const now = new Date().toISOString();
  return db
    .insert(fileSnapshots)
    .values({
      taskId: data.taskId ?? null,
      projectId: data.projectId ?? null,
      fileName: data.fileName,
      fileKey: data.fileKey,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize ?? null,
      mimeType: data.mimeType ?? null,
      uploadedBy: data.uploadedBy,
      version: 1,
      recordDate: data.recordDate || now,
      createdAt: now,
    })
    .run();
}
export async function updateFileSnapshotNotes(id: number, notes: string) {
  return db
    .update(fileSnapshots)
    .set({ notes })
    .where(eq(fileSnapshots.id, id))
    .run();
}
export async function updateFileSnapshotRecordDate(
  id: number,
  recordDate: string
) {
  return db
    .update(fileSnapshots)
    .set({ recordDate })
    .where(eq(fileSnapshots.id, id))
    .run();
}
export async function deleteFileSnapshot(id: number) {
  return db.delete(fileSnapshots).where(eq(fileSnapshots.id, id)).run();
}
export async function getFileStats(projectId: number) {
  const all = db
    .select()
    .from(fileSnapshots)
    .where(eq(fileSnapshots.projectId, projectId))
    .all();
  const images = all.filter(f => (f.mimeType || "").startsWith("image/"));
  const others = all.filter(f => !(f.mimeType || "").startsWith("image/"));
  return {
    total: all.length,
    images: images.length,
    others: others.length,
    totalSize: all.reduce((s, f) => s + (f.fileSize || 0), 0),
    withNotes: all.filter(f => f.notes).length,
    files: all,
  };
}
