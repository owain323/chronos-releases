import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, GripVertical } from "lucide-react";
import TaskDetailDrawer from "./TaskDetailDrawer";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface KanbanBoardProps {
  projectId: number;
}

// ===== 拖拽类型常量 =====
const DRAG_TYPE = "application/x-kanban-task";

// ===== 拖拽辅助 =====
function getDragData(
  e: React.DragEvent
): { taskId: number; columnId: number } | null {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE));
  } catch {
    return null;
  }
}

export default function KanbanBoard({ projectId }: KanbanBoardProps) {
  const [newColumnName, setNewColumnName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // 拖拽视觉状态
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

  const {
    data: columns,
    isLoading,
    refetch,
  } = trpc.kanban.getColumns.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const createColumnMutation = trpc.kanban.createColumn.useMutation({
    onSuccess: () => {
      toast.success("列创建成功");
      setNewColumnName("");
      setIsDialogOpen(false);
      refetch();
    },
    onError: error => toast.error(error.message || "创建列失败"),
  });

  const utils = trpc.useUtils();

  const updateTaskColumnMutation = trpc.tasks.updateColumn.useMutation({
    onMutate: async ({ taskId, columnId }) => {
      await utils.tasks.getByProject.cancel({ projectId });
      const prev = utils.tasks.getByProject.getData({ projectId });
      if (prev) {
        const moved = prev.map((t: any) =>
          t.id === taskId ? { ...t, columnId } : t
        );
        utils.tasks.getByProject.setData({ projectId }, moved);
      }
      return { prev };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prev) utils.tasks.getByProject.setData({ projectId }, ctx.prev);
      toast.error(error.message || "移动失败");
    },
    onSettled: () => {
      utils.tasks.getByProject.invalidate({ projectId });
    },
  });

  const handleCreateColumn = () => {
    if (!newColumnName.trim()) {
      toast.error("请输入列名称");
      return;
    }
    createColumnMutation.mutate({
      projectId,
      name: newColumnName,
      order: (columns?.length || 0) + 1,
    });
  };

  // ===== 拖拽处理 =====
  const handleDragOver = useCallback((e: React.DragEvent, columnId: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetColumnId: number) => {
      e.preventDefault();
      setDragOverColumn(null);
      setDraggingTaskId(null);

      const data = getDragData(e);
      if (!data) return;

      const { taskId, columnId: sourceColumnId } = data;
      if (sourceColumnId === targetColumnId) return; // 同列不处理

      // 跨列移动
      updateTaskColumnMutation.mutate({
        taskId,
        columnId: targetColumnId,
        order: 0,
      });
    },
    [updateTaskColumnMutation]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, taskId: number, columnId: number) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ taskId, columnId }));
      e.dataTransfer.effectAllowed = "move";
      setDraggingTaskId(taskId);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragOverColumn(null);
    setDraggingTaskId(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="w-[85vw] sm:w-72 lg:w-80 flex-shrink-0 h-96 bg-muted rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">任务看板</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            拖拽卡片即可移动任务到不同列
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
              <Plus className="w-4 h-4" /> 新建列
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建新列</DialogTitle>
              <DialogDescription>为看板添加新的任务列</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="column-name">列名称</Label>
                <Input
                  id="column-name"
                  placeholder="例如：待办、进行中、已完成"
                  value={newColumnName}
                  onChange={e => setNewColumnName(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreateColumn}
                disabled={createColumnMutation.isPending}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white"
              >
                {createColumnMutation.isPending ? "创建中..." : "创建列"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Kanban Columns — snap scroll on mobile */}
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth">
        {columns && columns.length > 0 ? (
          columns.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              projectId={projectId}
              allColumns={columns || []}
              onMoveTask={(taskId, columnId) =>
                updateTaskColumnMutation.mutate({ taskId, columnId, order: 0 })
              }
              onTaskClick={setSelectedTaskId}
              isDragOver={dragOverColumn === column.id}
              draggingTaskId={draggingTaskId}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))
        ) : (
          <Card className="w-full border-dashed border-2">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                暂无列，请创建第一个列
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        taskId={selectedTaskId || 0}
        isOpen={selectedTaskId !== null}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  );
}

// ===== KanbanColumn =====
interface KanbanColumnProps {
  column: any;
  projectId: number;
  allColumns: any[];
  onMoveTask: (taskId: number, columnId: number) => void;
  onTaskClick: (taskId: number) => void;
  isDragOver: boolean;
  draggingTaskId: number | null;
  onDragOver: (e: React.DragEvent, columnId: number) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, columnId: number) => void;
  onDragStart: (e: React.DragEvent, taskId: number, columnId: number) => void;
  onDragEnd: () => void;
}

function KanbanColumn({
  column,
  projectId,
  allColumns,
  onMoveTask,
  onTaskClick,
  isDragOver,
  draggingTaskId,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onDragEnd,
}: KanbanColumnProps) {
  const { data: tasks, isLoading } = trpc.tasks.getByColumn.useQuery(
    { columnId: column.id },
    { enabled: !!column.id }
  );

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);

  const createTaskMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("任务创建成功");
      setNewTaskTitle("");
      setIsAddingTask(false);
    },
    onError: error => toast.error(error.message || "创建任务失败"),
  });

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) {
      toast.error("请输入任务名称");
      return;
    }
    createTaskMutation.mutate({
      projectId,
      columnId: column.id,
      title: newTaskTitle,
      order: (tasks?.length || 0) + 1,
    });
  };

  const priorityBadge = (p: string) => {
    const map: Record<string, string> = {
      urgent: "text-red-600 bg-red-50",
      high: "text-orange-600 bg-orange-50",
      medium: "text-blue-600 bg-blue-50",
      low: "text-gray-500 bg-gray-50",
    };
    const labelMap: Record<string, string> = {
      urgent: "紧急",
      high: "高",
      medium: "中",
      low: "低",
    };
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded ${map[p] || map.medium}`}>
        {labelMap[p] || p}
      </span>
    );
  };

  return (
    <Card
      className={`w-[85vw] sm:w-72 lg:w-80 flex-shrink-0 flex flex-col max-h-[70vh] bg-white transition-all duration-150 snap-center ${
        isDragOver
          ? "ring-2 ring-sky-400 border-sky-400 bg-sky-50/30"
          : "border-gray-200"
      }`}
      onDragOver={e => onDragOver(e, column.id)}
      onDragLeave={onDragLeave}
      onDrop={e => onDrop(e, column.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{column.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {tasks?.length || 0} 个任务
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto space-y-2 pb-3 min-h-[100px]">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : tasks && tasks.length > 0 ? (
          tasks.map(task => (
            <div
              key={task.id}
              draggable
              onDragStart={e => onDragStart(e, task.id, column.id)}
              onDragEnd={onDragEnd}
              className={`group relative rounded-lg border bg-white p-3 transition-all ${
                draggingTaskId === task.id
                  ? "opacity-40 scale-95"
                  : "hover:shadow-md hover:border-sky-300 cursor-grab active:cursor-grabbing"
              }`}
              onClick={() => onTaskClick(task.id)}
            >
              {/* 拖拽手柄 */}
              <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="pl-4">
                <p className="text-sm font-medium text-foreground line-clamp-2">
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {priorityBadge(task.priority || "medium")}
                  <select
                    className="text-xs px-1.5 py-0.5 border rounded bg-white text-muted-foreground hover:border-sky-300 cursor-pointer"
                    value={column.id}
                    onChange={e => {
                      e.stopPropagation();
                      onMoveTask(task.id, Number(e.target.value));
                    }}
                    onClick={e => e.stopPropagation()}
                    title="移动到其他列"
                  >
                    {allColumns.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {task.dueDate && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.dueDate).toLocaleDateString("zh-CN")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div
            className={`rounded-lg border-2 border-dashed transition-colors py-8 ${
              isDragOver
                ? "border-sky-400 bg-sky-50/50 text-sky-600"
                : "border-muted text-muted-foreground"
            }`}
          >
            <p className="text-xs text-center">
              {isDragOver ? "松开放置" : "拖拽任务到此列"}
            </p>
          </div>
        )}
      </CardContent>

      {/* Add Task */}
      <div className="border-t p-3">
        {isAddingTask ? (
          <div className="space-y-2">
            <Input
              placeholder="任务名称..."
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              className="text-sm"
              onKeyDown={e => {
                if (e.key === "Enter") handleCreateTask();
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white"
              >
                {createTaskMutation.isPending ? "添加中..." : "添加"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsAddingTask(false);
                  setNewTaskTitle("");
                }}
              >
                取消
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsAddingTask(true)}
          >
            <Plus className="w-4 h-4" /> 添加任务
          </Button>
        )}
      </div>
    </Card>
  );
}
