/**
 * PermissionGuard — 前端条件渲染
 * 基于用户 workspaceRole 决定是否显示子组件
 * 仅做 UI 隐藏，真正的权限校验在后端
 */
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { hasPermission } from "@shared/permissions";

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({
  permission,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { current } = useCurrentWorkspace();
  // 仅用 workspace 角色做前端 guard，不额外请求
  // v4.0: role 未知时 fail-closed（不渲染），防越权
  if (!current || !("myRole" in current)) return fallback ?? null;
  const role = (current as any).myRole as string | null;
  if (!hasPermission(role, permission)) return fallback;
  return children;
}
