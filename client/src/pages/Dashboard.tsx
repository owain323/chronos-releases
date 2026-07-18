import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  ArrowRight,
  Users,
  Clock,
  Folder,
  Download,
  Search,
} from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "" });

  const {
    data: projects,
    isLoading,
    refetch,
  } = trpc.projects.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 获取第一个项目的成员和客户数据（用于Excel导出）
  const firstProjectId = projects?.[0]?.id;
  const { data: members } = trpc.projects.getMembers.useQuery(
    { projectId: firstProjectId || 0 },
    { enabled: !!firstProjectId }
  );
  const { data: customers } = trpc.customers.getByProject.useQuery(
    { projectId: firstProjectId || 0 },
    { enabled: !!firstProjectId }
  );

  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      toast.success("项目创建成功");
      setFormData({ name: "", description: "" });
      setIsDialogOpen(false);
      refetch();
    },
    onError: error => {
      toast.error(error.message || "创建项目失败");
    },
  });

  const handleCreateProject = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入项目名称");
      return;
    }
    createProjectMutation.mutate({
      name: formData.name,
      description: formData.description,
    });
  };

  // 导出团队成员和客户信息到Excel
  const handleExportTeamExcel = async () => {
    if (!firstProjectId) {
      toast.error("暂无项目数据");
      return;
    }

    try {
      // xlsx 体积大，按需异步加载（独立 chunk，不进首屏）
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      // Sheet 1: 团队成员
      const memberRows =
        members && members.length > 0
          ? members.map(m => ({
              ID: m.id,
              用户ID: m.userId,
              角色:
                m.role === "owner"
                  ? "负责人"
                  : m.role === "manager"
                    ? "管理员"
                    : "成员",
              加入时间: m.joinedAt
                ? new Date(m.joinedAt).toLocaleString("zh-CN")
                : "",
            }))
          : [{ ID: "", 用户ID: "", 角色: "暂无团队成员", 加入时间: "" }];

      const memberSheet = XLSX.utils.json_to_sheet(memberRows);
      XLSX.utils.book_append_sheet(workbook, memberSheet, "团队成员");

      // Sheet 2: 客户信息（含联系人）
      const customerRows: Record<string, string | number>[] = [];
      if (customers && customers.length > 0) {
        for (const customer of customers) {
          // 这里我们需要获取每个客户的联系人，但Dashboard层面没有这些数据
          // 简化处理：只导出客户基本信息
          customerRows.push({
            客户ID: customer.id,
            客户名称: customer.name,
            描述: customer.description || "",
            创建时间: customer.createdAt
              ? new Date(customer.createdAt).toLocaleString("zh-CN")
              : "",
          });
        }
      } else {
        customerRows.push({
          客户ID: "",
          客户名称: "暂无客户",
          描述: "",
          创建时间: "",
        });
      }

      const customerSheet = XLSX.utils.json_to_sheet(customerRows);
      XLSX.utils.book_append_sheet(workbook, customerSheet, "客户信息");

      // 下载
      XLSX.writeFile(
        workbook,
        `团队与客户信息_${new Date().toISOString().split("T")[0]}.xlsx`
      );
      toast.success("Excel 文件已下载");
    } catch (err) {
      console.error("Excel导出失败:", err);
      toast.error("Excel 导出失败");
    }
  };

  if (loading) {
    return (
      <ChronosLayout title="仪表板">
        <div className="space-y-6">
          <Skeleton className="h-12 w-48" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
        </div>
      </ChronosLayout>
    );
  }

  if (!isAuthenticated && !loading) {
    // AuthGuard 应该已经拦截，这里做兜底
    navigate("/login");
    return null;
  }

  return (
    <ChronosLayout title="仪表板">
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              欢迎回来，{user?.displayName || user?.name}
            </h1>
            <p className="text-muted-foreground">
              管理您的项目、任务和团队协作
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-sky-600 hover:bg-sky-700 text-white gap-2">
                <Plus className="w-4 h-4" />
                新建项目
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建新项目</DialogTitle>
                <DialogDescription>填写项目信息开始协作</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="project-name">项目名称</Label>
                  <Input
                    id="project-name"
                    placeholder="例如：2024 年营销活动"
                    value={formData.name}
                    onChange={e =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="project-desc">项目描述</Label>
                  <Textarea
                    id="project-desc"
                    placeholder="项目的简要描述"
                    value={formData.description}
                    onChange={e =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </div>
                <Button
                  onClick={handleCreateProject}
                  disabled={createProjectMutation.isPending}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                >
                  {createProjectMutation.isPending ? "创建中..." : "创建项目"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Folder className="w-4 h-4 text-sky-600" />
                活跃项目
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-foreground">
                {projects?.length ?? "—"}
              </div>
            </CardContent>
          </Card>

          <Card
            className="border-gray-200 hover:border-coral-300 hover:shadow-md transition-all cursor-pointer group"
            onClick={handleExportTeamExcel}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-coral-600" />
                团队成员
                <Download className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-coral-600" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-foreground">
                {stats?.totalMembers ?? "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1 group-hover:text-coral-600 transition-colors">
                点击查看 Excel 表格
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                待处理任务
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-bold text-foreground">
                {stats?.pendingTasks ?? "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Grid */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4">
            您的项目
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-40 rounded-lg" />
              ))}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <Card
                  key={project.id}
                  className="border-gray-200 hover:border-sky-300 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg group-hover:text-sky-600 transition-colors">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description || "暂无描述"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="px-2 py-1 bg-muted rounded">
                        {project.status === "active" ? "活跃" : "已归档"}
                      </span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Folder}
              title="还没有项目"
              description="创建一个项目来开始管理任务、供应商、客户和财务数据。所有数据存储在本地 SQLite 数据库中，完全离线可用。"
              actionLabel="创建第一个项目"
              onAction={() => setIsDialogOpen(true)}
              secondaryAction={
                <Button
                  variant="outline"
                  onClick={() => navigate("/search")}
                  className="gap-2"
                >
                  <Search className="w-4 h-4" />
                  探索功能
                </Button>
              }
            />
          )}
        </div>
      </div>
    </ChronosLayout>
  );
}
