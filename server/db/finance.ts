import { db, eq } from "./connection";
import { sql } from "drizzle-orm";
import {
  costEntries,
  revenueEntries,
  expenseEntries,
} from "../../drizzle/schema";

// ===== Cost Entries =====
export async function getCostEntriesByProjectId(projectId: number) {
  return db
    .select()
    .from(costEntries)
    .where(eq(costEntries.projectId, projectId))
    .limit(200)
    .all();
}
export async function createCostEntry(data: {
  projectId: number;
  name: string;
  amount: string;
  category: string;
  notes?: string;
  vendorId?: number;
  createdBy: number;
}) {
  const now = new Date().toISOString();
  return db
    .insert(costEntries)
    .values({
      projectId: data.projectId,
      name: data.name,
      amount: parseFloat(data.amount),
      category: data.category,
      notes: data.notes ?? null,
      vendorId: data.vendorId ?? null,
      createdBy: data.createdBy,
      date: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateCostEntry(
  id: number,
  data: {
    name: string;
    amount: string;
    category: string;
    notes?: string | null;
    date?: string;
  }
) {
  const set: Record<string, unknown> = {
    name: data.name,
    amount: parseFloat(data.amount),
    category: data.category,
    notes: data.notes ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (data.date) set.date = data.date;
  return db.update(costEntries).set(set).where(eq(costEntries.id, id)).run();
}

// ===== Revenue Entries =====
export async function getRevenueEntriesByProjectId(projectId: number) {
  return db
    .select()
    .from(revenueEntries)
    .where(eq(revenueEntries.projectId, projectId))
    .limit(200)
    .all();
}
export async function createRevenueEntry(data: {
  projectId: number;
  name: string;
  amount: string;
  category: string;
  notes?: string;
  customerId?: number;
  createdBy: number;
}) {
  const now = new Date().toISOString();
  return db
    .insert(revenueEntries)
    .values({
      projectId: data.projectId,
      name: data.name,
      amount: parseFloat(data.amount),
      category: data.category,
      notes: data.notes ?? null,
      customerId: data.customerId ?? null,
      createdBy: data.createdBy,
      date: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function deleteRevenueEntry(id: number) {
  return db.delete(revenueEntries).where(eq(revenueEntries.id, id)).run();
}
export async function updateRevenueEntry(
  id: number,
  data: {
    name: string;
    amount: string;
    category: string;
    notes?: string | null;
    date?: string;
  }
) {
  const set: Record<string, unknown> = {
    name: data.name,
    amount: parseFloat(data.amount),
    category: data.category,
    notes: data.notes ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (data.date) set.date = data.date;
  return db
    .update(revenueEntries)
    .set(set)
    .where(eq(revenueEntries.id, id))
    .run();
}

// ===== Expense Entries =====
export async function getExpenseEntriesByProjectId(projectId: number) {
  return db
    .select()
    .from(expenseEntries)
    .where(eq(expenseEntries.projectId, projectId))
    .limit(200)
    .all();
}
export async function createExpenseEntry(data: {
  projectId: number;
  name: string;
  amount: string;
  category: string;
  notes?: string;
  createdBy: number;
}) {
  const now = new Date().toISOString();
  return db
    .insert(expenseEntries)
    .values({
      projectId: data.projectId,
      name: data.name,
      amount: parseFloat(data.amount),
      category: data.category,
      notes: data.notes ?? null,
      createdBy: data.createdBy,
      date: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function deleteExpenseEntry(id: number) {
  return db.delete(expenseEntries).where(eq(expenseEntries.id, id)).run();
}
export async function deleteCostEntry(id: number) {
  return db.delete(costEntries).where(eq(costEntries.id, id)).run();
}
export async function updateExpenseEntry(
  id: number,
  data: {
    name: string;
    amount: string;
    category: string;
    notes?: string | null;
    date?: string;
  }
) {
  const set: Record<string, unknown> = {
    name: data.name,
    amount: parseFloat(data.amount),
    category: data.category,
    notes: data.notes ?? null,
    updatedAt: new Date().toISOString(),
  };
  if (data.date) set.date = data.date;
  return db
    .update(expenseEntries)
    .set(set)
    .where(eq(expenseEntries.id, id))
    .run();
}

// ===== Finance Summary =====
// USE_SQL_AGGREGATION=true → SQL GROUP BY (fast at 10K+)
// default → JS reduce (v2.10 back compat)
export async function getFinanceSummary(projectId: number) {
  const useSQL = process.env.USE_SQL_AGGREGATION === "true";

  if (useSQL) {
    const sumRevenue = db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(revenueEntries)
      .where(eq(revenueEntries.projectId, projectId))
      .get() as { total: number };
    const sumCost = db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(costEntries)
      .where(eq(costEntries.projectId, projectId))
      .get() as { total: number };
    const sumExpense = db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(expenseEntries)
      .where(eq(expenseEntries.projectId, projectId))
      .get() as { total: number };

    const revByCat = db
      .select({
        category: revenueEntries.category,
        total: sql<number>`SUM(amount)`,
      })
      .from(revenueEntries)
      .where(eq(revenueEntries.projectId, projectId))
      .groupBy(revenueEntries.category)
      .all() as { category: string; total: number }[];
    const costByCat = db
      .select({
        category: costEntries.category,
        total: sql<number>`SUM(amount)`,
      })
      .from(costEntries)
      .where(eq(costEntries.projectId, projectId))
      .groupBy(costEntries.category)
      .all() as { category: string; total: number }[];
    const expByCat = db
      .select({
        category: expenseEntries.category,
        total: sql<number>`SUM(amount)`,
      })
      .from(expenseEntries)
      .where(eq(expenseEntries.projectId, projectId))
      .groupBy(expenseEntries.category)
      .all() as { category: string; total: number }[];

    const toRecord = (arr: { category: string; total: number }[]) => {
      const m: Record<string, number> = {};
      arr.forEach(r => {
        m[r.category] = r.total;
      });
      return m;
    };

    const totalRevenue = sumRevenue?.total ?? 0;
    const totalCost = sumCost?.total ?? 0;
    const totalExpense = sumExpense?.total ?? 0;
    const profit = totalRevenue - totalCost - totalExpense;

    return {
      totalRevenue,
      totalCost,
      totalExpense,
      profit,
      margin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0,
      revenueByCategory: toRecord(revByCat),
      costByCategory: toRecord(costByCat),
      expenseByCategory: toRecord(expByCat),
      revenueCount: revByCat.length,
      costCount: costByCat.length,
      expenseCount: expByCat.length,
    };
  }

  // === JS legacy path ===
  const revenues = await getRevenueEntriesByProjectId(projectId);
  const costs = await getCostEntriesByProjectId(projectId);
  const expenses = await getExpenseEntriesByProjectId(projectId);
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
  const totalCost = costs.reduce((s, c) => s + c.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const profit = totalRevenue - totalCost - totalExpense;
  const byCategory = (items: { amount: number; category: string }[]) => {
    const m: Record<string, number> = {};
    items.forEach(i => {
      m[i.category] = (m[i.category] || 0) + i.amount;
    });
    return m;
  };
  return {
    totalRevenue,
    totalCost,
    totalExpense,
    profit,
    margin: totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0,
    revenueByCategory: byCategory(revenues),
    costByCategory: byCategory(costs),
    expenseByCategory: byCategory(expenses),
    revenueCount: revenues.length,
    costCount: costs.length,
    expenseCount: expenses.length,
  };
}
