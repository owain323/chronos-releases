import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  ListTodo,
  Store,
  Users,
  DollarSign,
  FolderOpen,
  Plug,
  Settings,
  Search,
  Building2,
  BarChart3,
} from "lucide-react";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  // 项目上下文：优先当前 URL 中的项目；无项目上下文时回退到
  // 当前工作区的第一个真实项目；仍无项目则禁用项目级命令（不再硬编码 "1"）
  const urlProjectId = location.match(/\/projects\/(\d+)/)?.[1] ?? null;
  const { data: projects } = trpc.projects.list.useQuery(undefined, {
    enabled: open,
  });
  const fallbackProjectId = projects?.[0]?.id;
  const projectId =
    urlProjectId ??
    (fallbackProjectId != null ? String(fallbackProjectId) : null);
  const hasProject = projectId != null;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(open => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const goTo = (path: string) => runCommand(() => navigate(path));
  const goToProject = (path: string) => {
    if (projectId != null) goTo(`/projects/${projectId}${path}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="输入命令或搜索页面..." />
      <CommandList>
        <CommandEmpty>没有找到结果。</CommandEmpty>
        <CommandGroup heading="页面导航">
          <CommandItem onSelect={() => goTo("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" /> 仪表盘
          </CommandItem>
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/tasks")}
          >
            <ListTodo className="mr-2 h-4 w-4" /> 任务列表
          </CommandItem>
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/vendors")}
          >
            <Store className="mr-2 h-4 w-4" /> 供应方
          </CommandItem>
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/sales")}
          >
            <Users className="mr-2 h-4 w-4" /> 销售方
          </CommandItem>
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/costs")}
          >
            <DollarSign className="mr-2 h-4 w-4" /> 成本管理
          </CommandItem>
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/files")}
          >
            <FolderOpen className="mr-2 h-4 w-4" /> 文件管理
          </CommandItem>
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/integrations")}
          >
            <Plug className="mr-2 h-4 w-4" /> 应用集成
          </CommandItem>
          <CommandSeparator />
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/members")}
          >
            <Users className="mr-2 h-4 w-4" /> 成员管理
          </CommandItem>
          {/* 修复死链：App.tsx 注册的是 /projects/:projectId/financial-reports，不是 /reports */}
          <CommandItem
            disabled={!hasProject}
            onSelect={() => goToProject("/financial-reports")}
          >
            <BarChart3 className="mr-2 h-4 w-4" /> 财务报表
          </CommandItem>
          <CommandSeparator />
          <CommandItem onSelect={() => goTo("/workspaces")}>
            <Building2 className="mr-2 h-4 w-4" /> 工作区
          </CommandItem>
          <CommandItem onSelect={() => goTo("/search")}>
            <Search className="mr-2 h-4 w-4" /> 全局搜索
          </CommandItem>
          <CommandItem onSelect={() => goTo("/settings")}>
            <Settings className="mr-2 h-4 w-4" /> 系统设置
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
