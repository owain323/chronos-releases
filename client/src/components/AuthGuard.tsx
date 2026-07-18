import { useAuth } from "@/_core/hooks/useAuth";
import { Shield } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

/** 仅 admin 可见 */
export function AdminGuard({ children, fallback }: Props) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role !== "admin") {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center">
          <Shield size={40} className="mx-auto text-gray-300 mb-4" />
          <p className="text-sm text-gray-500">需要管理员权限</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** 需要登录 — 未登录自动跳 /login?redirect=当前路径 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    const current = window.location.pathname + window.location.search;
    // 不要死循环 — 已经在 /login 就不重定向
    if (current.startsWith("/login")) return <>{children}</>;
    const redirect = encodeURIComponent(current);
    window.location.href = `/login?redirect=${redirect}`;
    return null;
  }

  return <>{children}</>;
}
