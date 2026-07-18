import { describe, expect, it } from "vitest";
import type { Response } from "express";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Since OAuth was removed, the "user" is always present (no null)
const testUser = {
  id: 1,
  openId: "sample-user",
  email: "sample@example.com",
  name: "Sample User",
  loginMethod: "local",
  role: "user",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  lastSignedIn: "2026-01-01T00:00:00Z",
} as const;

function createAuthContext(): { ctx: TrpcContext } {
  const ctx = {
    user: { ...testUser },
    workspaceId: 1,
    workspaceRole: "admin" as const,
    res: {} as unknown as Response,
    ip: "127.0.0.1",
    source: "user" as const,
    requestId: "test-ctx",
  } satisfies TrpcContext;
  return { ctx };
}

describe("auth", () => {
  it("logout returns success", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });

  it("me returns current user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result!.email).toBe("sample@example.com");
  });
});
