import { useParams, useLocation } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutGrid,
  Calendar,
  BarChart3,
  Users,
  Settings,
  Truck,
  DollarSign,
  FileText,
  Plug,
  Wallet,
} from "lucide-react";
import KanbanBoard from "@/components/KanbanBoard";
import CalendarView from "@/components/CalendarView";
import AnalyticsPanel from "@/components/AnalyticsPanel";
import AiAssistant from "@/components/AiAssistant";

export default function ProjectDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const projectId = parseInt(params.projectId || "0", 10);

  const { data: project, isLoading } = trpc.projects.getById.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const { data: members } = trpc.projects.getMembers.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  if (isLoading) {
    return (
      <ChronosLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </ChronosLayout>
    );
  }

  if (!project) {
    return (
      <ChronosLayout>
        <Card className="border-gray-200">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">项目未找到</p>
          </CardContent>
        </Card>
      </ChronosLayout>
    );
  }

  return (
    <ChronosLayout title={project.name}>
      <div className="space-y-6">
        {/* Project Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-muted-foreground break-words whitespace-pre-wrap max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/vendors`)}
            >
              <Truck className="w-4 h-4" />
              供应方
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/sales`)}
            >
              <Users className="w-4 h-4" />
              销售方
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/costs`)}
            >
              <DollarSign className="w-4 h-4" />
              成本
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100"
              onClick={() => navigate(`/projects/${projectId}/finance`)}
            >
              <Wallet className="w-4 h-4" />
              财务
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/files`)}
            >
              <FileText className="w-4 h-4" />
              文件
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate("/settings")}
            >
              <Settings className="w-4 h-4" />
              项目设置
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/integrations`)}
            >
              <Plug className="w-4 h-4" />
              应用集成
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/tasks`)}
            >
              <LayoutGrid className="w-4 h-4" />
              任务列表
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                团队成员
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {members?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                项目状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-semibold text-sky-600">
                {project.status === "active" ? "活跃" : "已归档"}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                创建时间
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-foreground">
                {new Date(project.createdAt).toLocaleDateString("zh-CN")}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="kanban" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-muted">
            <TabsTrigger value="kanban" className="gap-2">
              <LayoutGrid className="w-4 h-4" />
              看板
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="w-4 h-4" />
              日历
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              分析
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="gap-2"
              onClick={() => navigate(`/projects/${projectId}/members`)}
            >
              <Users className="w-4 h-4" />
              成员与伙伴
            </TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-6">
            <KanbanBoard projectId={projectId} />
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <CalendarView projectId={projectId} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <AnalyticsPanel projectId={projectId} />
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            <Card className="border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>团队成员</CardTitle>
                <Button size="sm" className="gap-2">
                  <Users className="w-4 h-4" />
                  邀请成员
                </Button>
              </CardHeader>
              <CardContent>
                {members && members.length > 0 ? (
                  <div className="space-y-4">
                    {members.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
                            {member.userId.toString().charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">
                              用户 #{member.userId}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {member.role === "owner"
                                ? "负责人"
                                : member.role === "admin"
                                  ? "管理员"
                                  : member.role === "member"
                                    ? "成员"
                                    : member.role}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">暂无团队成员</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <AiAssistant projectId={projectId} />
    </ChronosLayout>
  );
}
