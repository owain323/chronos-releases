/**
 * WorkspaceSettingsPage — 工作区设置（admin+ 可见）
 * 路由: /workspaces/:workspaceId/settings
 */
import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Settings, Users, Loader2, Save } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

export default function WorkspaceSettingsPage() {
  const [, params] = useRoute("/workspaces/:wid/settings");
  const wid = Number(params?.wid) || 0;
  useCurrentWorkspace();
  const [name, setName] = useState("");

  const { data: ws, isLoading } = trpc.workspaces.getById.useQuery(
    { id: wid },
    { enabled: wid > 0 }
  );

  useEffect(() => {
    if (ws) setName((ws as any).name || "");
  }, [ws]);

  const { data: membersData } = trpc.workspaces.members.useQuery(
    { workspaceId: wid },
    { enabled: wid > 0 }
  );

  const upd = trpc.workspaces.update.useMutation({
    onSuccess: () => toast.success("设置已保存"),
  });

  if (isLoading)
    return (
      <ChronosLayout title="工作区设置">
        <Skeleton className="h-40 w-full" />
      </ChronosLayout>
    );
  if (!ws)
    return (
      <ChronosLayout title="工作区设置">
        <p className="text-red-500 p-4">工作区不存在</p>
      </ChronosLayout>
    );

  return (
    <ChronosLayout title={`${ws.name} · 设置`}>
      <div className="max-w-2xl mx-auto space-y-6 p-4">
        {/* 基本信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5 text-sky-600" /> 基本信息
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label>组织名称</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
              <div>
                <span className="block text-xs text-gray-400">创建时间</span>
                {new Date((ws as any).createdAt).toLocaleDateString("zh-CN")}
              </div>
              <div>
                <span className="block text-xs text-gray-400">成员数量</span>
                {(membersData as any[])?.length ?? "—"}
              </div>
            </div>
            <Button
              onClick={() => upd.mutate({ id: wid, name })}
              disabled={!name.trim() || upd.isPending}
            >
              {upd.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              保存
            </Button>
          </CardContent>
        </Card>

        {/* 成员概览 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-sky-600" /> 成员 (
              {Array.isArray(membersData) ? membersData.length : "—"})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Array.isArray(membersData) && membersData.length > 0 ? (
              <div className="divide-y">
                {membersData.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-2 text-sm">
                    <span className="font-medium text-gray-700">
                      {m.userName || `用户 #${m.userId}`}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        m.role === "owner"
                          ? "bg-amber-100 text-amber-700"
                          : m.role === "admin"
                            ? "bg-sky-100 text-sky-700"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {m.role === "owner"
                        ? "Owner"
                        : m.role === "admin"
                          ? "Admin"
                          : "Member"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">暂无成员</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ChronosLayout>
  );
}
