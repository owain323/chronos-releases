// workspace-guard.ts — 工作区成员检查 helper (从 routers.ts 抽出)
import { TRPCError } from "@trpc/server";
import { getWorkspaceMembers } from "../db/workspaces";

type MemberInfo = {
  userId: number;
  role: string;
  id?: number;
  workspaceId?: number;
};

export async function getWorkspaceMembership(workspaceId: number, userId: number) {
  const members = await getWorkspaceMembers(workspaceId);
  const member = members.find((m: MemberInfo) => m.userId === userId);
  return { members, member };
}

export async function requireWorkspaceMember(
  workspaceId: number,
  userId: number,
  opts?: { roles?: string[]; message?: string }
) {
  const { members, member } = await getWorkspaceMembership(workspaceId, userId);
  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: opts?.message ?? "你不是该工作区成员",
    });
  }
  if (opts?.roles && !opts.roles.includes(member.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: opts.message ?? "权限不足",
    });
  }
  return { members, member };
}
