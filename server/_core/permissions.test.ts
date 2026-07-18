/**
 * RBAC 权限矩阵一致性测试
 *
 * 真实 import shared/permissions.ts（单一事实源），
 * 断言矩阵语义 + 服务端 permissionProcedure 集成行为。
 * 禁止在测试里复制权限字面量本地矩阵。
 */
import { describe, expect, it } from "vitest";
import type { Response } from "express";
import {
  ROLE_PERMISSIONS,
  hasPermission,
  normalizePermission,
  permissionsForRole,
} from "@shared/permissions";
import { permissionProcedure, router } from "./trpc";
import type { TrpcContext } from "./context";

describe("shared/permissions · 矩阵语义", () => {
  it("owner 通配全部权限", () => {
    expect(ROLE_PERMISSIONS.owner).toContain("*");
    expect(hasPermission("owner", "finance.edit")).toBe(true);
    expect(hasPermission("owner", "workspace.delete")).toBe(true);
    expect(hasPermission("owner", "anything.at.all")).toBe(true);
  });

  it("member 无任何财务权限", () => {
    expect(hasPermission("member", "finance.view")).toBe(false);
    expect(hasPermission("member", "finance.edit")).toBe(false);
    // 旧写法 read/update 同义词收敛后同样拒绝
    expect(hasPermission("member", "finance.read")).toBe(false);
    expect(hasPermission("member", "finance.update")).toBe(false);
  });

  it("viewer 全只读：无任何写权限", () => {
    expect(hasPermission("viewer", "project.view")).toBe(true);
    expect(hasPermission("viewer", "task.view")).toBe(true);
    expect(hasPermission("viewer", "project.create")).toBe(false);
    expect(hasPermission("viewer", "task.create")).toBe(false);
    expect(hasPermission("viewer", "task.edit")).toBe(false);
    expect(hasPermission("viewer", "finance.view")).toBe(false);
    expect(hasPermission("viewer", "member.manage")).toBe(false);
  });

  it("admin 与 owner 的差异：admin 无 workspace.delete，owner 通配", () => {
    expect(hasPermission("admin", "workspace.delete")).toBe(false);
    expect(hasPermission("owner", "workspace.delete")).toBe(true);
    // admin 拥有其余全部域权限
    expect(hasPermission("admin", "finance.view")).toBe(true);
    expect(hasPermission("admin", "finance.edit")).toBe(true);
    expect(hasPermission("admin", "member.manage")).toBe(true);
    expect(hasPermission("admin", "audit.view")).toBe(true);
    expect(hasPermission("admin", "project.delete")).toBe(true);
  });

  it("member 可建项目与任务，但不可删除/改项目", () => {
    expect(hasPermission("member", "project.create")).toBe(true);
    expect(hasPermission("member", "task.create")).toBe(true);
    expect(hasPermission("member", "task.edit")).toBe(true);
    expect(hasPermission("member", "project.edit")).toBe(false);
    expect(hasPermission("member", "project.delete")).toBe(false);
    expect(hasPermission("member", "task.delete")).toBe(false);
  });

  it("fail-closed：null/未知角色一律拒绝", () => {
    expect(hasPermission(null, "project.view")).toBe(false);
    expect(hasPermission(undefined, "project.view")).toBe(false);
    expect(hasPermission("superuser", "project.view")).toBe(false);
  });

  it("动词同义词收敛：read→view, update→edit", () => {
    expect(normalizePermission("project.read")).toBe("project.view");
    expect(normalizePermission("project.update")).toBe("project.edit");
    expect(normalizePermission("project.view")).toBe("project.view");
    expect(hasPermission("admin", "project.read")).toBe(true);
    expect(hasPermission("admin", "project.update")).toBe(true);
  });

  it("member.* 旧权限点收敛到 member.manage", () => {
    expect(normalizePermission("member.invite")).toBe("member.manage");
    expect(normalizePermission("member.remove")).toBe("member.manage");
    expect(normalizePermission("member.updateRole")).toBe("member.manage");
    expect(hasPermission("admin", "member.invite")).toBe(true);
    expect(hasPermission("member", "member.invite")).toBe(false);
  });

  it("permissionsForRole 与 hasPermission 自洽", () => {
    for (const role of ["admin", "member", "viewer"] as const) {
      for (const perm of permissionsForRole(role)) {
        expect(hasPermission(role, perm)).toBe(true);
      }
    }
    expect(permissionsForRole(null)).toEqual([]);
  });
});

describe("permissionProcedure · 服务端集成", () => {
  function ctxWithRole(
    workspaceRole: TrpcContext["workspaceRole"]
  ): TrpcContext {
    return {
      user: { id: 1, name: "T", email: "t@t.dev", role: "user" },
      workspaceId: 1,
      workspaceRole,
      ip: "127.0.0.1",
      res: {} as unknown as Response,
      source: "user",
      requestId: "perm-test",
    };
  }

  // 最小 probe router — 验证中间件放行/拒绝行为
  const probeRouter = router({
    viewFinance: permissionProcedure("finance.view").query(() => "ok"),
    editFinance: permissionProcedure("finance.edit").query(() => "ok"),
    deleteWorkspace: permissionProcedure("workspace.delete").query(() => "ok"),
  });

  it("member 被 finance.view 拒绝 (FORBIDDEN)", async () => {
    const caller = probeRouter.createCaller(ctxWithRole("member"));
    await expect(caller.viewFinance()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("viewer 被 finance.view 拒绝 (FORBIDDEN)", async () => {
    const caller = probeRouter.createCaller(ctxWithRole("viewer"));
    await expect(caller.viewFinance()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("admin 放行 finance.view / finance.edit", async () => {
    const caller = probeRouter.createCaller(ctxWithRole("admin"));
    await expect(caller.viewFinance()).resolves.toBe("ok");
    await expect(caller.editFinance()).resolves.toBe("ok");
  });

  it("owner 放行任意权限；admin 被 workspace.delete 拒绝", async () => {
    const owner = probeRouter.createCaller(ctxWithRole("owner"));
    await expect(owner.deleteWorkspace()).resolves.toBe("ok");
    const admin = probeRouter.createCaller(ctxWithRole("admin"));
    await expect(admin.deleteWorkspace()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("未登录 (user=null) 拒绝 (UNAUTHORIZED)", async () => {
    const caller = probeRouter.createCaller({
      ...ctxWithRole("admin"),
      user: null,
    });
    await expect(caller.viewFinance()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
