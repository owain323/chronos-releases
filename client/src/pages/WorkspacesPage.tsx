/**
 * WorkspacesPage — 组织（工作区）管理中心
 * 使用 shadcn/ui 组件: Tabs · Card · Table · Badge · Dialog · Button
 */
import { useState } from "react";
import { roleLabel } from "@/lib/roleLabel";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Users,
  Plus,
  Mail,
  Shield,
  Loader2,
  Settings,
} from "lucide-react";

export default function WorkspacesPage() {
  const [, navigate] = useLocation();
  const [newName, setNewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDialog, setInviteDialog] = useState(false);
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);

  const {
    data: workspaces,
    isLoading,
    refetch,
  } = trpc.workspaces.list.useQuery();
  const createWs = trpc.workspaces.create.useMutation({
    onSuccess: () => {
      refetch();
      setNewName("");
      toast.success("组织创建成功");
    },
  });

  const inviteByEmail = trpc.workspaces.inviteByEmail.useMutation({
    onSuccess: () => {
      refetch();
      setInviteEmail("");
      setInviteDialog(false);
      toast.success("邀请已发送");
    },
    onError: e => toast.error(`邀请失败: ${e.message}`),
  });

  const [activeWs, setActiveWs] = useState<number | null>(null);
  const { data: members, isLoading: membersLoading } =
    trpc.workspaces.members.useQuery(
      { workspaceId: activeWs! },
      { enabled: !!activeWs }
    );

  const handleCreate = () => {
    const slug =
      newName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64) || "workspace";
    if (!slug) {
      toast.error("请输入有效的组织名称");
      return;
    }
    createWs.mutate({ name: newName, slug });
  };

  return (
    <ChronosLayout title="组织管理">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 创建 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-sky-600" />
              创建组织
            </CardTitle>
            <CardDescription>
              每个组织是完全独立的数据隔离容器。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Input
              placeholder="组织名称"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
            <Button
              onClick={handleCreate}
              disabled={createWs.isPending || !newName.trim()}
            >
              {createWs.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              创建
            </Button>
          </CardContent>
        </Card>

        {/* 列表 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-sky-600" />
              我的组织
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : workspaces && workspaces.length > 0 ? (
              <Tabs
                value={activeWs ? String(activeWs) : String(workspaces[0].id)}
                onValueChange={v => setActiveWs(Number(v))}
              >
                <TabsList className="mb-4 w-full justify-start overflow-auto">
                  {workspaces.map((w: any) => (
                    <TabsTrigger
                      key={w.id}
                      value={String(w.id)}
                      className="gap-2"
                    >
                      <Building2 className="h-4 w-4" />
                      {w.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {workspaces.map((w: any) => (
                  <TabsContent
                    key={w.id}
                    value={String(w.id)}
                    className="space-y-4"
                  >
                    {/* 组织信息 */}
                    <div className="flex justify-between items-start">
                      <div className="grid grid-cols-2 gap-4 text-sm flex-1">
                        <div>
                          <span className="text-gray-500">名称</span>
                          <p className="font-medium">{w.name}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">标识</span>
                          <p className="font-mono text-xs">{w.slug}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">创建时间</span>
                          <p>
                            {new Date(w.createdAt).toLocaleDateString("zh-CN")}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/workspaces/${w.id}/settings`)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        设置
                      </Button>
                    </div>

                    {/* 成员 */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-sm flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          成员
                        </h3>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedWsId(w.id);
                            setInviteDialog(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> 邀请
                        </Button>
                      </div>

                      {activeWs === w.id && membersLoading ? (
                        <Skeleton className="h-10 w-full rounded" />
                      ) : members && members.length > 0 ? (
                        <div className="divide-y">
                          {members.map((m: any) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold text-xs">
                                  {(m.userName || `U${m.userId}`)[0]}
                                </div>
                                <span className="text-sm">
                                  {m.userName || `用户 #${m.userId}`}
                                </span>
                              </div>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${m.role === "owner" ? "bg-amber-100 text-amber-700" : m.role === "admin" ? "bg-sky-100 text-sky-700" : "bg-gray-100 text-gray-600"}`}
                              >
                                {roleLabel(m.role)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">暂无成员数据</p>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Building2 className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p>还没有创建任何组织</p>
                <p className="text-xs mt-1">使用上方表单创建你的第一个组织</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 邀请弹窗 */}
      <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" /> 邀请成员
            </DialogTitle>
            <DialogDescription>输入成员邮箱发送邀请。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">邮箱</Label>
              <Input
                id="invite-email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="member@example.com"
                type="email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialog(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!selectedWsId || !inviteEmail.trim()) return;
                inviteByEmail.mutate({
                  workspaceId: selectedWsId,
                  email: inviteEmail.trim(),
                });
              }}
              disabled={inviteByEmail.isPending}
            >
              {inviteByEmail.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              发送邀请
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ChronosLayout>
  );
}
