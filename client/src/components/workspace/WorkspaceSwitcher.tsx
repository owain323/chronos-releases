/**
 * WorkspaceSwitcher — 工作区切换器
 * 完全使用 shadcn/ui 组件: DropdownMenu + Dialog + Skeleton
 * 状态: loading / empty / list 三态完整
 */
import { useState } from "react";
import { Building2, Check, ChevronDown, Plus, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { NewWorkspaceDialog } from "./NewWorkspaceDialog";

export function WorkspaceSwitcher() {
  const { current, workspaces, isLoading, switchTo } = useCurrentWorkspace();
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const utils = trpc.useUtils();

  const handleCreated = async (id: number) => {
    await utils.workspaces.list.invalidate();
    switchTo(id);
    setDialogOpen(false);
  };

  if (isLoading) {
    return <Skeleton className="h-9 w-full rounded-md" />;
  }

  return (
    <div className="px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between gap-2 h-9 px-3"
            aria-label="切换工作区"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0 text-sky-600" />
              <span className="truncate text-sm font-medium">
                {current?.name || workspaces[0]?.name || "选择工作区"}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          <DropdownMenuLabel className="text-xs text-gray-500">
            我的工作区
          </DropdownMenuLabel>
          {workspaces.length === 0 ? (
            <div className="px-2 py-3 text-xs text-gray-500 text-center">
              还没有工作区
            </div>
          ) : (
            workspaces.map(ws => {
              const active = (current?.id ?? workspaces[0]?.id) === ws.id;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  onSelect={() => switchTo(ws.id)}
                  className="cursor-pointer"
                >
                  <Building2 className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="flex-1 truncate">{ws.name}</span>
                  {active && <Check className="h-4 w-4 text-sky-600" />}
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              navigate("/workspaces");
            }}
            className="cursor-pointer"
          >
            <Settings className="h-4 w-4 mr-2" />
            管理组织
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setDialogOpen(true)}
            className="cursor-pointer text-sky-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            新建工作区
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  );
}
