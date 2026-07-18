/**
 * useCurrentWorkspace — 当前工作区（组织）状态
 * 持久化到 localStorage
 * 切换时刷新页面以让所有数据源重新拉取
 */
import { useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "currentWorkspaceId";

export function useCurrentWorkspace() {
  const { data: workspaces, isLoading } = trpc.workspaces.list.useQuery();
  const [currentId, setCurrentId] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });

  // 首次加载: 选第一个工作区
  useEffect(() => {
    if (workspaces && workspaces.length > 0 && currentId == null) {
      setCurrentId(workspaces[0].id);
      localStorage.setItem(STORAGE_KEY, String(workspaces[0].id));
    } else if (
      workspaces &&
      currentId != null &&
      !workspaces.find(w => w.id === currentId)
    ) {
      // 当前选择已失效 (被删/移除权限) → 退回第一个
      setCurrentId(workspaces[0]?.id ?? null);
      if (workspaces[0])
        localStorage.setItem(STORAGE_KEY, String(workspaces[0].id));
    }
  }, [workspaces, currentId]);

  const switchTo = useCallback((id: number) => {
    setCurrentId(id);
    localStorage.setItem(STORAGE_KEY, String(id));
    // 清除 X-Workspace-Id 关联的旧 cookie (WSID)
    document.cookie = "WSID=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    // 导航到首页 (避免停留在旧项目URL)
    // 硬刷新: 所有 tRPC 缓存失效, 新 token/header 生效
    // CHRONOS 数据全在服务端, 无未保存状态, 安全
    window.location.href = "/";
  }, []);

  const current = workspaces?.find(w => w.id === currentId) ?? null;

  return { current, workspaces: workspaces ?? [], isLoading, switchTo };
}
