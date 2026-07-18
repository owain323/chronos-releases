import { trpc } from "@/lib/trpc";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

export default function NotificationCenter() {
  // workspace 维度：聚合当前工作区下所有项目的通知（服务端从 x-workspace-id 解析）
  const { current, isLoading: wsLoading } = useCurrentWorkspace();
  const enabled = !!current;
  const { data, isLoading, refetch } =
    trpc.notifications.getByWorkspace.useQuery(undefined, { enabled });
  const unread = trpc.notifications.getWorkspaceUnreadCount.useQuery(
    undefined,
    { enabled }
  );
  const markRead = trpc.notifications.markRead.useMutation();
  const markAllRead = trpc.notifications.markAllReadByWorkspace.useMutation();

  const handleMarkRead = async (id: number) => {
    await markRead.mutateAsync({ id });
    refetch();
    unread.refetch();
  };

  const handleMarkAll = async () => {
    await markAllRead.mutateAsync();
    refetch();
    unread.refetch();
    toast.success("全部标记为已读");
  };

  const notifications = data || [];

  return (
    <ChronosLayout title="通知中心">
      <div className="max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Bell size={22} className="text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              通知中心
              {unread.data != null && unread.data > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                  {unread.data}
                </span>
              )}
            </h2>
          </div>
          {unread.data != null && unread.data > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              className="gap-2"
            >
              <CheckCheck size={14} />
              全部已读
            </Button>
          )}
        </div>

        {isLoading || wsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-gray-400" size={28} />
          </div>
        ) : notifications.length === 0 ? (
          <Card>
            <CardContent className="text-center py-16">
              <Bell size={40} className="mx-auto text-gray-300 mb-4" />
              <p className="text-sm text-gray-500">暂无通知</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <Card
                key={n.id}
                className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                  !n.read ? "border-l-4 border-l-indigo-500" : "opacity-60"
                }`}
                onClick={() => !n.read && handleMarkRead(n.id)}
              >
                <CardContent className="py-3 px-4 flex items-start gap-3">
                  <span className="text-lg mt-0.5">
                    {n.type === "task"
                      ? "📋"
                      : n.type === "file"
                        ? "📄"
                        : n.type === "finance"
                          ? "💰"
                          : "🔔"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(n.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ChronosLayout>
  );
}
