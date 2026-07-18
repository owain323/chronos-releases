/**
 * AuditPage — 审计日志查看（admin+ 可见）
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Clock, FileText } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login: { label: "登录", color: "text-green-600" },
  logout: { label: "登出", color: "text-gray-500" },
  create: { label: "创建", color: "text-sky-600" },
  update: { label: "更新", color: "text-amber-600" },
  delete: { label: "删除", color: "text-red-600" },
  permission_denied: { label: "权限拒绝", color: "text-red-700" },
};

export default function AuditPage() {
  const [page, setPage] = useState(0);
  const { current } = useCurrentWorkspace();
  const { data, isLoading, error } = trpc.audit.list.useQuery(
    { limit: 50, offset: page * 50 },
    { enabled: !!current }
  );

  return (
    <ChronosLayout title="审计日志">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-sky-600" />
              操作审计日志
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full rounded" />
                ))}
              </div>
            ) : error ? (
              <p className="text-sm text-red-500 py-4">
                加载失败: {error.message}
              </p>
            ) : data && data.length > 0 ? (
              <div className="divide-y">
                {data.map(entry => {
                  const a = ACTION_LABELS[entry.action] || {
                    label: entry.action,
                    color: "text-gray-600",
                  };
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 py-2 text-sm"
                    >
                      <span
                        className={`font-mono text-xs shrink-0 w-16 ${a.color}`}
                      >
                        {a.label}
                      </span>
                      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="text-gray-600 truncate">
                        {entry.entity}#{entry.entityId}
                      </span>
                      <span className="text-gray-400 text-xs ml-auto shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4">暂无审计记录</p>
            )}
            {/* 修复：第 2 页起不足 50 条时也要能返回上一页 */}
            {data && (page > 0 || data.length >= 50) && (
              <div className="flex justify-between mt-3 pt-3 border-t">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-xs text-sky-600 hover:underline disabled:text-gray-300"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="text-xs text-sky-600 hover:underline"
                >
                  下一页
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ChronosLayout>
  );
}
