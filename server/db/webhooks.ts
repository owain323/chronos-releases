import { db, eq } from "./connection";
import { webhooks } from "../../drizzle/schema";

export async function getWebhooksByProjectId(projectId: number) {
  return db
    .select()
    .from(webhooks)
    .where(eq(webhooks.projectId, projectId))
    .all();
}
export async function getWebhookById(id: number) {
  return db.select().from(webhooks).where(eq(webhooks.id, id)).get();
}
export async function createWebhook(data: {
  projectId: number;
  name: string;
  platform: string;
  webhookUrl: string;
  config?: string;
}) {
  const now = new Date().toISOString();
  return db
    .insert(webhooks)
    .values({
      projectId: data.projectId,
      name: data.name,
      platform: data.platform,
      webhookUrl: data.webhookUrl,
      config: data.config ?? null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function deleteWebhook(id: number) {
  return db.delete(webhooks).where(eq(webhooks.id, id)).run();
}
export async function updateWebhook(
  id: number,
  data: { enabled?: boolean; webhookUrl?: string }
) {
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.enabled !== undefined) updates.enabled = data.enabled;
  if (data.webhookUrl !== undefined) updates.webhookUrl = data.webhookUrl;
  return db.update(webhooks).set(updates).where(eq(webhooks.id, id)).run();
}
