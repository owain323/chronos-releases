import { db, eq, desc } from "./connection";
import { tasks, subtasks, taskComments } from "../../drizzle/schema";

// Tasks
export async function getTasksByColumnId(columnId: number) {
  return db.select().from(tasks).where(eq(tasks.columnId, columnId)).all();
}
export async function getTasksByProjectId(
  projectId: number,
  opts?: { offset?: number; limit?: number }
) {
  const base = db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.updatedAt));
  const withOffset = opts?.offset ? base.offset(opts.offset) : base;
  const result = opts?.limit ? withOffset.limit(opts.limit) : withOffset;
  return result.all();
}
export async function getTaskById(taskId: number) {
  const result = db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}
export async function createTask(data: {
  projectId: number;
  columnId: number;
  title: string;
  description?: string;
  assigneeId?: number;
  creatorId: number;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: Date;
  order: number;
}) {
  const now = new Date().toISOString();
  return db
    .insert(tasks)
    .values({
      projectId: data.projectId,
      columnId: data.columnId,
      title: data.title,
      description: data.description ?? null,
      assigneeId: data.assigneeId ?? null,
      creatorId: data.creatorId,
      priority: data.priority ?? "medium",
      dueDate:
        data.dueDate instanceof Date
          ? data.dueDate.toISOString()
          : (data.dueDate ?? null),
      order: data.order,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateTask(
  taskId: number,
  data: {
    title?: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    assigneeId?: number;
    columnId?: number;
  }
) {
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.dueDate !== undefined) updates.dueDate = data.dueDate;
  if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId;
  if (data.columnId !== undefined) updates.columnId = data.columnId;
  return db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();
}
export async function deleteTask(taskId: number) {
  return db.delete(tasks).where(eq(tasks.id, taskId)).run();
}
export async function updateTaskColumn(
  taskId: number,
  columnId: number,
  order: number
) {
  return db
    .update(tasks)
    .set({ columnId, order, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId))
    .run();
}

// Subtasks
export async function getSubtasksByTaskId(taskId: number) {
  return db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).all();
}
export async function createSubtask(data: { taskId: number; title: string }) {
  const now = new Date().toISOString();
  return db
    .insert(subtasks)
    .values({
      taskId: data.taskId,
      title: data.title,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateSubtaskStatus(
  subtaskId: number,
  completed: boolean
) {
  return db
    .update(subtasks)
    .set({ completed, updatedAt: new Date().toISOString() })
    .where(eq(subtasks.id, subtaskId))
    .run();
}

// Comments
export async function getCommentsByTaskId(taskId: number) {
  return db
    .select()
    .from(taskComments)
    .where(eq(taskComments.taskId, taskId))
    .all();
}
export async function createTaskComment(data: {
  taskId: number;
  authorId: number;
  content: string;
  mentions?: number[];
}) {
  const now = new Date().toISOString();
  return db
    .insert(taskComments)
    .values({
      taskId: data.taskId,
      authorId: data.authorId,
      content: data.content,
      mentions: data.mentions ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
