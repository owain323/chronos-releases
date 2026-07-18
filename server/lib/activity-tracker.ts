import { db } from "../db/connection";
import { activityEvents } from "../db/activityEvents";

export class ActivityTracker {
  static async track(event: {
    userId: number;
    workspaceId?: number;
    sessionId?: string;
    source: string;
    category: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    level: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    requestId?: string;
    status: string;
  }): Promise<void> {
    db.insert(activityEvents)
      .values({
        userId: event.userId,
        workspaceId: event.workspaceId ?? undefined,
        sessionId: event.sessionId ?? undefined,
        source: event.source as any,
        category: event.category as any,
        action: event.action,
        resourceType: event.resourceType ?? undefined,
        resourceId: event.resourceId ?? undefined,
        level: event.level as any,
        metadata: event.metadata ?? undefined,
        ipAddress: event.ipAddress ?? undefined,
        requestId: event.requestId ?? undefined,
        status: event.status as any,
      })
      .execute()
      .catch(err => {
        console.error("[ActivityTracker] Failed to write event:", err);
      });
  }

  static async trackImportantQuery(params: {
    userId: number;
    workspaceId?: number;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.track({
      ...params,
      source: "USER",
      category: "ACCESS",
      level: "IMPORTANT",
      status: "SUCCESS",
    });
  }
}
