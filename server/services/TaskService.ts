/**
 * TaskService — 任务业务逻辑层
 * 从 router 中抽取：创建任务时需要的权限、通知、审计等跨域逻辑
 */
import * as db from "../db";
import { recordAudit } from "../lib/audit";
import { notifyByEmail } from "./EmailService";

export interface CreateTaskInput {
  projectId: number;
  columnId: number;
  title: string;
  description?: string;
  assigneeId?: number;
  priority?: "low" | "medium" | "high" | "urgent";
  dueDate?: Date;
  order: number;
  taskNumber?: number;
}

export async function createTask(
  input: CreateTaskInput,
  userId: number,
  userName: string
) {
  const result = (await db.createTask({ ...input, creatorId: userId })) as any;
  const taskId = result?.id ?? result?.lastInsertRowid ?? 0;

  // 异步通知 — 不阻塞
  const project = await db.getProjectById(input.projectId);
  import("../lib/notifications")
    .then(({ notifyAsync, notify }) => {
      notifyAsync(input.projectId, "task_created", {
        projectName: project?.name || `项目#${input.projectId}`,
        taskTitle: input.title,
        assignee: userName,
      });
      notify(
        input.projectId,
        userId,
        "task_created",
        "新任务",
        input.title,
        `/projects/${input.projectId}/tasks`
      );
    })
    .catch((err: unknown) =>
      console.error("[TaskService] notify failed:", err)
    );

  recordAudit({
    userId,
    action: "create",
    entity: "task",
    entityId: taskId,
    projectId: input.projectId,
  });

  // 邮件通知 assignee（异步，失败不影响主流程）
  if (input.assigneeId) {
    notifyByEmail(
      input.assigneeId,
      `新任务: ${input.title}`,
      `你被分配到新任务「${input.title}」`
    ).catch((err: unknown) =>
      console.error("[TaskService] notifyByEmail failed:", err)
    );
  }

  return result;
}

export async function updateTask(
  taskId: number,
  data: {
    title?: string;
    description?: string;
    columnId?: number;
    assigneeId?: number;
    priority?: string;
    dueDate?: string | Date;
    order?: number;
  }
) {
  // 检查是否移到"已完成"列 → 触发通知
  if (data.columnId) {
    const task = await db.getTaskById(taskId);
    if (task) {
      const columns = await db.getKanbanColumnsByProjectId(task.projectId);
      const doneCol = columns.find(c =>
        ["已完成", "完成", "done", "completed"].includes(c.name.toLowerCase())
      );
      if (doneCol && data.columnId === doneCol.id) {
        const project = await db.getProjectById(task.projectId);
        import("../lib/notifications")
          .then(({ notifyAsync, notify }) => {
            notifyAsync(task.projectId, "task_completed", {
              projectName: project?.name || `项目#${task.projectId}`,
              taskTitle: task.title,
            });
            notify(
              task.projectId,
              task.creatorId,
              "task_completed",
              "任务完成",
              task.title,
              `/projects/${task.projectId}/tasks`
            );
          })
          .catch((err: unknown) =>
            console.error("[TaskService] completeTask notify failed:", err)
          );
      }
    }
  }
  return db.updateTask(taskId, data as any);
}

export async function deleteTask(taskId: number) {
  return db.deleteTask(taskId);
}
