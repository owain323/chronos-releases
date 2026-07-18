/**
 * CostService — 成本业务逻辑层
 */
import * as db from "../db";
import { recordAudit } from "../lib/audit";

export interface CreateCostInput {
  projectId: number;
  name: string;
  amount: string;
  category: string;
  notes?: string;
  vendorId?: number;
}

export async function createCost(
  input: CreateCostInput,
  userId: number,
  _userName: string
) {
  const cost = (await db.createCostEntry({
    ...input,
    createdBy: userId,
  })) as any;
  const cid = cost?.id ?? cost?.lastInsertRowid ?? 0;

  recordAudit({ userId, action: "create", entity: "costs", entityId: cid });

  // 异步通知
  const project = await db.getProjectById(input.projectId);
  import("../lib/notifications")
    .then(({ notifyAsync, notify }) => {
      notifyAsync(input.projectId, "cost_added", {
        projectName: project?.name || `项目#${input.projectId}`,
        costName: input.name,
        amount: input.amount,
      });
      notify(
        input.projectId,
        userId,
        "cost_added",
        "新增成本",
        `¥${input.amount} ${input.name}`,
        `/projects/${input.projectId}/costs`
      );
    })
    .catch(err => console.error("[CostService] notify failed:", err));

  return cost;
}

export async function deleteCost(id: number, userId: number) {
  recordAudit({ userId, action: "delete", entity: "costs", entityId: id });
  return db.deleteCostEntry(id);
}
