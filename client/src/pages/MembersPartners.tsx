import { useParams } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { roleLabel } from "@/lib/roleLabel";
import {
  Users,
  UserPlus,
  Building2,
  Phone,
  StickyNote,
  Shield,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";

export default function MembersPartners() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);

  const {
    data: members,
    isLoading,
    refetch,
  } = trpc.projects.getMembers.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const { data: customerContacts = [] } =
    trpc.customerContacts.getByProject.useQuery(
      { projectId },
      { enabled: projectId > 0 }
    );

  const { data: vendorContacts = [] } =
    trpc.vendorContacts.getByProject.useQuery(
      { projectId },
      { enabled: projectId > 0 }
    );

  const allExternalContacts = [
    ...customerContacts.map(c => ({
      ...c,
      sourceType: "customer" as const,
      sourceName: c.entityName,
    })),
    ...vendorContacts.map(c => ({
      ...c,
      sourceType: "vendor" as const,
      sourceName: c.entityName,
    })),
  ];

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ role: "member", phone: "", notes: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ role: "", phone: "", notes: "" });
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<{
    id: number;
    name: string;
    email: string;
  } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const searchUsers = trpc.auth.searchUsers.useQuery(
    {
      query: userSearch,
      workspaceId: (() => {
        try {
          const v = localStorage.getItem("currentWorkspaceId");
          return v ? parseInt(v, 10) : 1;
        } catch {
          return 1;
        }
      })(),
    },
    { enabled: userSearch.length >= 2 }
  );

  const addMember = trpc.projects.addMember.useMutation({
    onSuccess: () => {
      toast.success("成员已添加");
      setShowAdd(false);
      setForm({ role: "member", phone: "", notes: "" });
      setUserSearch("");
      setSelectedUser(null);
      refetch();
    },
  });

  const updateMember = trpc.projects.updateMember.useMutation({
    onSuccess: () => {
      toast.success("已更新");
      setEditingId(null);
      refetch();
    },
  });

  const deleteMember = trpc.projects.deleteMember.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      refetch();
    },
  });

  function MemberRow({ m }: { m: any }) {
    if (editingId === m.id) {
      return (
        <div className="flex items-center gap-3 p-3 bg-sky-50 rounded-lg">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input
              value={editForm.role}
              onChange={e => setEditForm({ ...editForm, role: e.target.value })}
              className="text-xs h-8"
              placeholder="角色"
            />
            <Input
              value={editForm.phone}
              onChange={e =>
                setEditForm({ ...editForm, phone: e.target.value })
              }
              className="text-xs h-8"
              placeholder="手机号码"
            />
            <Input
              value={editForm.notes}
              onChange={e =>
                setEditForm({ ...editForm, notes: e.target.value })
              }
              className="text-xs h-8"
              placeholder="备注"
            />
          </div>
          <button
            className="text-green-600"
            onClick={() => updateMember.mutate({ id: m.id, ...editForm })}
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            className="text-muted-foreground"
            onClick={() => setEditingId(null)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg group hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <Shield
            className={`w-4 h-4 shrink-0 ${m.role === "owner" ? "text-amber-500" : m.role === "manager" ? "text-sky-500" : "text-gray-400"}`}
          />
          <div className="min-w-0">
            <div className="text-sm font-medium">{m.userId || "成员"}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{roleLabel(m.role)}</span>
              {m.phone && (
                <>
                  <span>·</span>
                  <Phone className="w-3 h-3" /> {m.phone}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {m.notes && (
            <span title={m.notes}>
              <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
          )}
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => {
              setEditingId(m.id);
              setEditForm({
                role: m.role,
                phone: m.phone || "",
                notes: m.notes || "",
              });
            }}
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-sky-600" />
          </button>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => {
              if (confirm("确定移除此成员？"))
                deleteMember.mutate({ id: m.id, projectId: Number(projectId) });
            }}
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
          </button>
        </div>
      </div>
    );
  }

  function ExternalRow({ c }: { c: any }) {
    return (
      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="w-4 h-4 text-coral-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">{c.name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{c.sourceName}</span>
              <span>·</span>
              <span>{c.role || "联系人"}</span>
              {c.phone && (
                <>
                  <span>·</span>
                  <Phone className="w-3 h-3" /> {c.phone}
                </>
              )}
            </div>
          </div>
        </div>
        <div>
          {c.notes && (
            <span title={c.notes}>
              <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <ChronosLayout title="成员与伙伴">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">成员与伙伴</h1>
            <p className="text-muted-foreground mt-1">
              管理项目内部成员与外部合作伙伴
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
                  <UserPlus className="w-4 h-4" /> 添加成员
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加项目成员</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div className="relative">
                    <label className="text-sm font-medium">
                      搜索用户（邮箱或姓名）
                    </label>
                    <Input
                      className="mt-1"
                      placeholder="输入邮箱或姓名搜索..."
                      value={userSearch}
                      onChange={e => {
                        setUserSearch(e.target.value);
                        setShowDropdown(true);
                        setSelectedUser(null);
                      }}
                      onFocus={() => setShowDropdown(true)}
                    />
                    {showDropdown &&
                      searchUsers.data &&
                      searchUsers.data.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded border border-gray-200 bg-white shadow-lg max-h-40 overflow-auto">
                          {searchUsers.data.map((u: any) => (
                            <div
                              key={u.id}
                              className="cursor-pointer px-3 py-2 text-sm hover:bg-sky-50"
                              onClick={() => {
                                setSelectedUser(u);
                                setUserSearch(u.email);
                                setShowDropdown(false);
                              }}
                            >
                              <span className="font-medium">{u.name}</span>
                              <span className="text-gray-400 ml-2">
                                {u.email}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    {selectedUser && (
                      <p className="mt-1 text-xs text-green-600">
                        已选择: {selectedUser.name} ({selectedUser.email})
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium">角色</label>
                    <select
                      className="w-full border rounded px-3 py-2 mt-1 text-sm"
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                    >
                      <option value="member">成员</option>
                      <option value="manager">管理员</option>
                      <option value="owner">负责人</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">手机号码</label>
                    <Input
                      value={form.phone}
                      onChange={e =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      placeholder="选填"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">备注</label>
                    <Textarea
                      value={form.notes}
                      onChange={e =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      placeholder="职责、加入时间等..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  <Button
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                    disabled={!selectedUser}
                    onClick={() => {
                      if (!selectedUser) return;
                      addMember.mutate({
                        projectId,
                        userId: selectedUser.id,
                        role: form.role as any,
                        phone: form.phone || undefined,
                        notes: form.notes || undefined,
                      });
                    }}
                  >
                    确认添加
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="internal">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="internal" className="gap-2">
              <Users className="w-4 h-4" /> 内部成员 ({members?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-2">
              <Building2 className="w-4 h-4" /> 外部伙伴 (
              {allExternalContacts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="pt-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                加载中...
              </div>
            ) : !members || members.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">暂无内部成员</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {members.map(m => (
                  <MemberRow key={m.id} m={m} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="external" className="pt-4">
            {allExternalContacts.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-12 text-center">
                  <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">暂无外部伙伴</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    请在「销售方」或「供应方」中添加联系人
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {allExternalContacts.map(c => (
                  <ExternalRow key={`${c.sourceType}-${c.id}`} c={c} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ChronosLayout>
  );
}
