import { useCallback, useMemo, useRef } from "react";
import { trpc, setToken, clearToken } from "@/lib/trpc";

/**
 * useAuth — 双通道抗踢
 *
 * v3.8 修复：
 * - useMutation 提升到 hook 顶层（原先在 logout 闭包内调用 useMutation，违反 Hooks 规则）
 * - logout 失败不再静默吞错（记录日志后继续本地清理，保证用户能登出）
 * - 删除假实现 refresh（无后端支撑，且无消费方）
 * - user 透传完整字段（含 displayName/avatarUrl），不再裁剪
 */
export function useAuth() {
  const {
    data: user,
    isLoading,
    error,
  } = trpc.auth.me.useQuery(undefined, {
    retry: 3,
    retryDelay: 2000,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: prev => prev, // keepPreviousData equivalent
  });

  type MeUser = NonNullable<typeof user>;
  const lastGoodUser = useRef<MeUser | null>(null);

  // 有数据 → 缓存
  if (user) lastGoodUser.current = user;

  // Hooks 规则：mutation 必须在顶层创建
  const { mutateAsync: logoutAsync } = trpc.auth.logout.useMutation();

  const logout = useCallback(async () => {
    try {
      await logoutAsync();
    } catch (e) {
      // 服务端登出失败（如网络断开）不阻断本地登出，但错误必须可见
      console.error("[useAuth] logout 请求失败，继续本地清理:", e);
    }
    clearToken();
    window.location.href = "/login";
  }, [logoutAsync]);

  return useMemo(() => {
    // 验证中 + 有缓存 → 保持认证
    if (isLoading) {
      return {
        user: lastGoodUser.current,
        loading: true,
        error: null as string | null,
        isAuthenticated: !!lastGoodUser.current,
        logout,
      };
    }
    // 有当前用户 → 认证
    if (user) {
      return {
        user,
        loading: false,
        error: null as string | null,
        isAuthenticated: true,
        logout,
      };
    }
    // v4.0: 有错误时清除缓存，防止被吊销会话保活
    if (error) {
      lastGoodUser.current = null;
      return {
        user: null,
        loading: false,
        error: error.message ?? ("登录状态校验失败" as string),
        isAuthenticated: false,
        logout,
      };
    }
    // 真正未登录
    return {
      user: null,
      loading: false,
      error: null as string | null,
      isAuthenticated: false,
      logout,
    };
  }, [isLoading, user, error, logout]);
}

/** 登录成功后: 存 cookie + localStorage 双通道 */
export function storeAuth(token: string, _user: unknown) {
  void _user;
  setToken(token);
}
