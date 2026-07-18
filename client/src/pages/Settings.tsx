import { useAuth } from "@/_core/hooks/useAuth";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/contexts/ThemeContext";
import { roleLabel } from "@/lib/roleLabel";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function BotBindingCard() {
  const codeMutation = trpc.auth.generateBotCode.useMutation();

  const handleGenerate = () => {
    codeMutation.mutateAsync().then(() => {
      toast.success("验证码已生成");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>绑定机器人</CardTitle>
        <CardDescription>
          生成验证码，在企业微信或钉钉机器人中完成账号绑定
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-sky-50 p-4 space-y-2">
          <p className="text-sm text-gray-600">
            1. 点击下方按钮生成 <strong>6 位验证码</strong>
          </p>
          <p className="text-sm text-gray-600">
            2. 在机器人对话中输入{" "}
            <code className="bg-sky-100 px-1 rounded">/login 验证码</code>
          </p>
          <p className="text-sm text-gray-600">
            3. 绑定成功后，机器人将自动以你的身份执行命令
          </p>
        </div>

        {codeMutation.data?.code ? (
          <div className="rounded-lg border-2 border-sky-500 bg-white p-6 text-center">
            <p className="text-xs text-gray-500 mb-2">
              你的验证码（5 分钟有效）
            </p>
            <p className="text-4xl font-mono font-bold tracking-[0.3em] text-sky-600">
              {codeMutation.data.code}
            </p>
          </div>
        ) : (
          <Button
            onClick={handleGenerate}
            disabled={codeMutation.isPending}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white"
          >
            {codeMutation.isPending ? "生成中..." : "生成机器人绑定验证码"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ProfileCard({ user }: { user: any }) {
  const [displayName, setDisplayName] = useState(
    user?.displayName || user?.name || ""
  );
  const [bio, setBio] = useState(user?.bio || "");
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => toast.success("资料已保存"),
    onError: (e: any) => toast.error(e?.message || "保存失败"),
  });
  const uploadAvatar = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => toast.success("头像已更新"),
    onError: (e: any) => toast.error(e?.message || "上传失败"),
  });

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      uploadAvatar.mutate({ dataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>个人信息</CardTitle>
        <CardDescription>编辑您的个人资料</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-sky-100 flex items-center justify-center text-2xl font-bold text-sky-600 overflow-hidden">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                (displayName || user?.name || "?")[0]
              )}
            </div>
            <label className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border shadow flex items-center justify-center cursor-pointer">
              <Camera className="w-3 h-3 text-gray-500" />
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs text-gray-500">显示名</label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="输入显示名..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">简介</label>
              <Input
                value={bio}
                onChange={e => setBio(e.target.value)}
                className="mt-1 h-8 text-sm"
                placeholder="一句话介绍自己"
                maxLength={200}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            onClick={() =>
              updateProfile.mutate({
                displayName: displayName || user?.name || "",
                bio,
              })
            }
            className="bg-sky-600 hover:bg-sky-700"
          >
            保存资料
          </Button>
        </div>
        <div className="text-xs text-gray-400 pt-2 border-t">
          邮箱: {user?.email || "未设置"} · 角色: {roleLabel(user?.role || "")}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user, loading } = useAuth();
  const { theme } = useTheme();

  const meQuery = trpc.auth.me.useQuery();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(false);
  const [taskReminders, setTaskReminders] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // 服务端偏好优先，未设置时回退 localStorage
  useEffect(() => {
    if (prefsLoaded || !meQuery.data) return;
    const p = (meQuery.data as any).notificationPrefs;
    if (p) {
      setNotificationsEnabled(p.notifications ?? true);
      setEmailAlerts(p.email ?? false);
      setTaskReminders(p.reminders ?? false);
    } else {
      setNotificationsEnabled(
        localStorage.getItem("settings_notifications") !== "false"
      );
      setEmailAlerts(localStorage.getItem("settings_email") !== "false");
      setTaskReminders(localStorage.getItem("settings_reminders") === "true");
    }
    setPrefsLoaded(true);
  }, [meQuery.data, prefsLoaded]);

  const updateNotificationPrefs = trpc.auth.updateNotificationPrefs.useMutation(
    {
      onSuccess: () => toast.success("通知设置已保存"),
      onError: (e: any) => toast.error(e?.message || "保存失败"),
    }
  );

  const persistPrefs = (
    notifications: boolean,
    email: boolean,
    reminders: boolean
  ) => {
    updateNotificationPrefs.mutate({ notifications, email, reminders });
  };
  const setNotifications = (v: boolean) => {
    setNotificationsEnabled(v);
    persistPrefs(v, emailAlerts, taskReminders);
  };
  const setEmailAlerts2 = (v: boolean) => {
    setEmailAlerts(v);
    persistPrefs(notificationsEnabled, v, taskReminders);
  };
  const setReminders2 = (v: boolean) => {
    setTaskReminders(v);
    persistPrefs(notificationsEnabled, emailAlerts, v);
  };

  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("账号已删除，即将跳转到登录页");
      setTimeout(() => (window.location.href = "/"), 1500);
    },
    onError: (e: any) => toast.error(e?.message || "删除失败"),
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => toast.success("密码修改成功，请重新登录"),
    onError: (e: any) => toast.error(e?.message || "修改失败"),
  });

  if (loading) {
    return (
      <ChronosLayout title="系统设置">
        <Card>
          <CardHeader>
            <CardTitle>加载中...</CardTitle>
          </CardHeader>
        </Card>
      </ChronosLayout>
    );
  }

  return (
    <ChronosLayout title="系统设置">
      <div className="max-w-2xl">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">个人信息</TabsTrigger>
            <TabsTrigger value="appearance">外观设置</TabsTrigger>
            <TabsTrigger value="notifications">通知设置</TabsTrigger>
            <TabsTrigger value="data">数据管理</TabsTrigger>
            <TabsTrigger value="connect">连接</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <ProfileCard user={user} />
          </TabsContent>

          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>外观设置</CardTitle>
                <CardDescription>自定义界面外观</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">当前主题</p>
                    <p className="text-xs text-muted-foreground">
                      {theme === "dark" ? "深色模式" : "浅色模式"}
                    </p>
                  </div>
                  <div className="text-2xl">
                    {theme === "dark" ? "🌙" : "☀️"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>通知设置</CardTitle>
                <CardDescription>管理您接收通知的方式</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    label: "启用通知",
                    desc: "接收应用内通知",
                    key: "notifications",
                    val: notificationsEnabled,
                    set: setNotifications,
                  },
                  {
                    label: "邮件提醒",
                    desc: "通过邮件接收重要更新",
                    key: "email",
                    val: emailAlerts,
                    set: setEmailAlerts2,
                  },
                  {
                    label: "任务到期提醒",
                    desc: "任务即将到期时提醒",
                    key: "reminders",
                    val: taskReminders,
                    set: setReminders2,
                  },
                ].map(item => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                    <Switch checked={item.val} onCheckedChange={item.set} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>数据管理</CardTitle>
                <CardDescription>导出或清理您的数据</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="text-sm font-medium">修改密码</p>
                    <p className="text-xs text-muted-foreground">
                      至少12位，含大小写字母和数字
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const oldPw = prompt("请输入当前密码:");
                      if (!oldPw) return;
                      const newPw = prompt("请输入新密码（至少12位）:");
                      if (!newPw || newPw.length < 12) {
                        toast.error("新密码至少12位");
                        return;
                      }
                      changePassword.mutate({
                        currentPassword: oldPw,
                        newPassword: newPw,
                      });
                    }}
                  >
                    修改
                  </Button>
                </div>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="text-sm font-medium">导出我的数据</p>
                    <p className="text-xs text-muted-foreground">
                      导出个人项目与任务数据为 JSON (GDPR)
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const wid = localStorage.getItem("currentWorkspaceId");
                        const res = await fetch(
                          "/api/trpc/auth.exportData?input=" +
                            encodeURIComponent(
                              JSON.stringify({
                                workspaceId: wid
                                  ? parseInt(wid, 10)
                                  : undefined,
                              })
                            ),
                          { credentials: "include" }
                        );
                        const json = await res.json();
                        const exportJson = json?.result?.data || {
                          exportedAt: new Date().toISOString(),
                          user: { name: user?.name, email: user?.email },
                        };
                        const blob = new Blob(
                          [JSON.stringify(exportJson, null, 2)],
                          { type: "application/json" }
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `chronos-export-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success("数据已导出");
                      } catch {
                        toast.error("导出失败");
                      }
                    }}
                  >
                    导出
                  </Button>
                </div>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="text-sm font-medium text-red-600">删除账号</p>
                    <p className="text-xs text-muted-foreground">
                      软删除: 清空个人信息, 保留业务数据。操作不可撤销
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => {
                      const pw = prompt("请输入当前密码确认删除账号:");
                      if (!pw) return;
                      if (
                        !confirm(
                          "确认删除账号？个人信息将被清空，业务数据保留。此操作不可撤销。"
                        )
                      )
                        return;
                      deleteAccount.mutate({ password: pw });
                    }}
                  >
                    删除账号
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">清除缓存</p>
                    <p className="text-xs text-muted-foreground">
                      清除本地缓存数据并重新加载
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (
                        !confirm("确认清除本地缓存？主题/通知偏好等将被重置。")
                      )
                        return;
                      localStorage.clear();
                      toast.success("本地缓存已清除");
                    }}
                  >
                    清除缓存
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="connect" className="space-y-4">
            <BotBindingCard />
          </TabsContent>
        </Tabs>
      </div>
    </ChronosLayout>
  );
}
