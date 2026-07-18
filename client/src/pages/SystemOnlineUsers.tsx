import React from "react";
import { trpc } from "@/lib/trpc";
import { SystemGuard } from "@/components/SystemGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800",
    IDLE: "bg-yellow-100 text-yellow-800",
    OFFLINE: "bg-gray-100 text-gray-800",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status === "ACTIVE" ? "在线" : status === "IDLE" ? "空闲" : status}
    </span>
  );
}

export default function SystemOnlineUsers() {
  const { data: sessions, isLoading } = trpc.system.listOnlineUsers.useQuery();

  return (
    <SystemGuard>
      <div className="p-6 max-w-5xl">
        <h1 className="text-2xl font-bold mb-4">在线用户</h1>
        <Card>
          <CardHeader>
            <CardTitle>当前在线 · {sessions?.length ?? 0} 人</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">加载中...</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">用户</th>
                    <th>邮箱</th>
                    <th>状态</th>
                    <th>IP</th>
                    <th>设备</th>
                    <th>最后活动</th>
                    <th>登录时间</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions?.map((s: any) => (
                    <tr
                      key={s.sessionId}
                      className="border-b hover:bg-muted/50"
                    >
                      <td className="py-2 font-medium">
                        {s.userName || `用户#${s.userId}`}
                      </td>
                      <td className="text-muted-foreground">{s.userEmail}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="text-muted-foreground">
                        {s.ipAddress || "-"}
                      </td>
                      <td className="text-muted-foreground">
                        {s.device || "-"}
                      </td>
                      <td className="text-muted-foreground">
                        {s.lastActiveAt
                          ? formatDistanceToNow(new Date(s.lastActiveAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })
                          : "-"}
                      </td>
                      <td className="text-muted-foreground">
                        {s.loginAt
                          ? formatDistanceToNow(new Date(s.loginAt), {
                              addSuffix: true,
                              locale: zhCN,
                            })
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  {(!sessions || sessions.length === 0) && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        暂无在线用户
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </SystemGuard>
  );
}
