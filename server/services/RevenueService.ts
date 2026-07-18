/**
 * RevenueService — 收入业务逻辑层
 */
import * as db from "../db";
import { recordAudit } from "../lib/audit";

export async function createRevenue(
  input: {
    projectId: number;
    name: string;
    amount: string;
    category: string;
    notes?: string;
    customerId?: number;
  },
  userId: number
) {
  const rev = await db.createRevenueEntry({ ...input, createdBy: userId });
  recordAudit({
    userId,
    action: "create",
    entity: "revenues",
    entityId: (rev as any).id,
  });
  return rev;
}

export async function updateRevenue(
  id: number,
  input: {
    name: string;
    amount: string;
    category: string;
    notes?: string | null;
    date?: string;
  },
  userId: number
) {
  const result = await db.updateRevenueEntry(id, input);
  recordAudit({ userId, action: "update", entity: "revenues", entityId: id });
  return result;
}

export async function deleteRevenue(id: number, userId: number) {
  recordAudit({ userId, action: "delete", entity: "revenues", entityId: id });
  return db.deleteRevenueEntry(id);
}
