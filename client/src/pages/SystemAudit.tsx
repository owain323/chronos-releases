import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { SystemGuard } from "@/components/SystemGuard";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

const LEVEL_COLORS: Record<string, string> = {
  INFO: "bg-gray-100 text-gray-700",
  IMPORTANT: "bg-blue-100 text-blue-800",
  SECURITY: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export default function SystemAudit() {
  const [filters, setFilters] = useState({
    level: "IMPORTANT" as string,
    category: "" as string,
    userId: 0 as number,
    limit: 50,
    offset: 0,
  });

  const { data, isLoading } = trpc.system.listAuditEvents.useQuery(filters);

  return (
    <SystemGuard>
      <div className="p-6 max-w-6xl">
        <h1 className="text-2xl font-bold mb-4">审计查询</h1>

        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="pt-4 flex flex-wrap gap-3">
            <select
              value={filters.level}
              onChange={e =>
                setFilters({ ...filters, level: e.target.value, offset: 0 })
              }
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="IMPORTANT">IMPORTANT+</option>
              <option value="INFO">全部</option>
              <option value="SECURITY">SECURITY+</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <select
              value={filters.category}
              onChange={e =>
                setFilters({ ...filters, category: e.target.value, offset: 0 })
              }
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="">全部分类</option>
              <option value="AUTH">认证</option>
              <option value="ACCESS">访问</option>
              <option value="BUSINESS">业务</option>
              <option value="SECURITY">安全</option>
              <option value="AI">AI</option>
            </select>
            <input
              type="number"
              placeholder="用户ID"
              value={filters.userId || ""}
              onChange={e =>
                setFilters({
                  ...filters,
                  userId: Number(e.target.value) || 0,
                  offset: 0,
                })
              }
              className="border rounded px-2 py-1 text-sm w-24"
            />
            <div className="text-sm text-muted-foreground self-center">
              共 {data?.length ?? 0} 条
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <p className="text-muted-foreground py-8 text-center">
                加载中...
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 w-36">时间</th>
                    <th className="w-16">级别</th>
                    <th className="w-20">分类</th>
                    <th>操作</th>
                    <th className="w-12">用户</th>
                    <th className="w-16">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {(data as any[])?.map((e: any) => (
                    <tr key={e.id} className="border-b hover:bg-muted/50">
                      <td className="py-2 text-xs text-muted-foreground">
                        {e.createdAt
                          ? formatDistanceToNow(new Date(e.createdAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })
                          : "-"}
                      </td>
                      <td>
                        <span
                          className={`px-1.5 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[e.level] || ""}`}
                        >
                          {e.level}
                        </span>
                      </td>
                      <td className="text-xs">{e.category}</td>
                      <td className="font-mono text-xs">{e.action}</td>
                      <td className="text-xs">#{e.userId}</td>
                      <td>
                        <span
                          className={`text-xs ${e.status === "SUCCESS" ? "text-green-600" : "text-red-600"}`}
                        >
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!data || data.length === 0) && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-muted-foreground"
                      >
                        暂无审计事件
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {data && data.length === filters.limit && (
              <div className="flex justify-between mt-3">
                <button
                  disabled={filters.offset === 0}
                  onClick={() =>
                    setFilters({
                      ...filters,
                      offset: Math.max(0, filters.offset - filters.limit),
                    })
                  }
                  className="text-sm text-blue-600 disabled:text-gray-400"
                >
                  ← 上一页
                </button>
                <button
                  onClick={() =>
                    setFilters({
                      ...filters,
                      offset: filters.offset + filters.limit,
                    })
                  }
                  className="text-sm text-blue-600"
                >
                  下一页 →
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SystemGuard>
  );
}
