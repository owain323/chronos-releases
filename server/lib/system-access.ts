import { TRPCError } from "@trpc/server";
import { db } from "../db/connection";
import { systemRoles } from "../db/systemRoles";
import { eq } from "drizzle-orm";

export async function requireSystemAccess(
  userId: number,
  requiredRole: "SYSTEM_OWNER" | "SYSTEM_AUDITOR"
): Promise<void> {
  const result = db
    .select()
    .from(systemRoles)
    .where(eq(systemRoles.userId, userId))
    .get();

  if (!result) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "System access required",
    });
  }

  if (result.systemRole === "SYSTEM_OWNER") return;
  if (result.systemRole === requiredRole) return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Required: ${requiredRole}`,
  });
}
