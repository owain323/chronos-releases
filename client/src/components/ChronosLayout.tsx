import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Building2,
  Settings,
  LogOut,
  Plus,
  Folder,
  Menu,
  ArrowLeft,
  Pencil,
  Trash2,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/contexts/ThemeContext";
import { MobileTabBar } from "@/components/MobileTabBar";
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher";
import { LegalDialog } from "@/components/legal/LegalDialog";
import { ProjectEditDialog } from "@/components/workspace/ProjectEditDialog";
import { ProjectDeleteDialog } from "@/components/workspace/ProjectDeleteDialog";

interface ChronosLayoutProps {
  children: ReactNode;
  title?: string;
}

export function ChronosLayout({ children, title }: ChronosLayoutProps) {
  const { user, logout } = useAuth();
  const [location, navigate] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<"privacy" | "terms">("privacy");
  const [editProject, setEditProject] = useState<any>(null);
  const [deleteProject, setDeleteProject] = useState<any>(null);

  const { data: projects, isLoading } = trpc.projects.list.useQuery(undefined, {
    enabled: !!user,
  });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    logout();
    navigate("/");
  };

  // 侧边栏内容（桌面和移动端共用）
  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-4">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center text-white font-bold shrink-0">
          TN
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-gray-900 truncate">CHRONOS</h1>
          <p className="text-[10px] text-gray-500">团队协作平台</p>
        </div>
      </div>

      {/* 工作区切换器 */}
      <WorkspaceSwitcher />

      {/* 导航 */}
      <div className="flex-1 overflow-auto py-2">
        <div className="px-3 py-1">
          <button
            onClick={() => {
              navigate("/");
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <LayoutDashboard className="h-4 w-4" />
            仪表板
          </button>
          <button
            onClick={() => {
              navigate("/workspaces");
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <Building2 className="h-4 w-4" />
            组织管理
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs font-medium text-gray-400">项目</span>
            <button
              onClick={() => {
                navigate("/projects/new");
                setSidebarOpen(false);
              }}
              className="p-0.5"
            >
              <Plus className="w-3 h-3 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          <div className="mt-1 space-y-0.5">
            {isLoading ? (
              <div className="space-y-1 px-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : projects && projects.length > 0 ? (
              projects.map(project => (
                <div key={project.id} className="flex items-center group">
                  <button
                    onClick={() => {
                      navigate(`/projects/${project.id}`);
                      setSidebarOpen(false);
                    }}
                    className="flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 truncate"
                  >
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </button>
                  <div className="flex items-center gap-0.5 pr-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setEditProject(project);
                      }}
                      className="p-1 rounded text-sky-500/80"
                      title="编辑项目"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setDeleteProject(project);
                      }}
                      className="p-1 rounded text-red-500/80"
                      title="删除项目"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 px-3 py-1">暂无项目</p>
            )}
          </div>
        </div>
      </div>

      {/* 底部 */}
      <div className="border-t border-gray-200 p-3 space-y-1">
        <button
          onClick={() => {
            navigate("/settings");
            setSidebarOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Settings className="h-4 w-4" />
          设置
        </button>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="h-4 w-4" />
          登出
        </button>
        <div className="px-3 pt-2">
          <p className="text-xs font-semibold text-gray-900 truncate">
            {user?.displayName || user?.name || "用户"}
          </p>
          <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
        </div>
        <div className="px-3 pt-1">
          <div className="flex gap-3 text-[10px] text-gray-400">
            <button
              type="button"
              onClick={() => {
                setLegalTab("privacy");
                setLegalOpen(true);
                setSidebarOpen(false);
              }}
              className="hover:text-gray-600"
            >
              隐私政策
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={() => {
                setLegalTab("terms");
                setLegalOpen(true);
                setSidebarOpen(false);
              }}
              className="hover:text-gray-600"
            >
              服务条款
            </button>
          </div>
        </div>
      </div>
      <LegalDialog
        open={legalOpen}
        onOpenChange={setLegalOpen}
        defaultTab={legalTab}
      />
      {editProject && (
        <ProjectEditDialog
          projectId={editProject.id}
          currentName={editProject.name}
          currentDescription={editProject.description}
          open={!!editProject}
          onOpenChange={v => {
            if (!v) setEditProject(null);
          }}
          onSaved={() => {
            setEditProject(null);
            utils.projects.list.invalidate();
          }}
        />
      )}
      {deleteProject && (
        <ProjectDeleteDialog
          projectId={deleteProject.id}
          projectName={deleteProject.name}
          open={!!deleteProject}
          onOpenChange={v => {
            if (!v) setDeleteProject(null);
          }}
          onDeleted={() => {
            setDeleteProject(null);
            utils.projects.list.invalidate();
          }}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-dvh w-full bg-white">
      {/* 桌面端：固定侧边栏 */}
      <aside className="hidden lg:flex w-[250px] shrink-0 flex-col border-r border-gray-200">
        {sidebarContent}
      </aside>

      {/* 移动端：Sheet 覆盖 */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* 主内容 */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* 顶部栏 */}
        <header className="flex h-12 md:h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 md:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center justify-center rounded-lg h-9 w-9 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>
          {(location === "/privacy" || location === "/terms") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="gap-1 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          )}
          <h2 className="text-base md:text-xl font-semibold text-gray-900 truncate">
            {title || "CHRONOS"}
          </h2>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="text-xs md:text-sm h-8 md:h-9 shrink-0"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </Button>
        </header>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto pb-20 md:pb-0">
          <div className="p-3 md:p-6">{children}</div>
        </div>

        <MobileTabBar />
      </div>
    </div>
  );
}
