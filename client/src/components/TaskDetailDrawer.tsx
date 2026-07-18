import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, MessageSquare } from "lucide-react";
import { toast } from "sonner";

interface TaskDetailDrawerProps {
  taskId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskDetailDrawer({
  taskId,
  isOpen,
  onClose,
}: TaskDetailDrawerProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newComment, setNewComment] = useState("");

  const { data: task, isLoading } = trpc.tasks.getById.useQuery(
    { taskId },
    { enabled: isOpen && taskId > 0 }
  );

  const { data: subtasks, refetch: refetchSubtasks } =
    trpc.subtasks.getByTask.useQuery(
      { taskId },
      { enabled: isOpen && taskId > 0 }
    );

  const { data: comments, refetch: refetchComments } =
    trpc.comments.getByTask.useQuery(
      { taskId },
      { enabled: isOpen && taskId > 0 }
    );

  const { data: files } = trpc.files.getByTask.useQuery(
    { taskId },
    { enabled: isOpen && taskId > 0 }
  );

  const createSubtaskMutation = trpc.subtasks.create.useMutation({
    onSuccess: () => {
      toast.success("子任务添加成功");
      setNewSubtaskTitle("");
      refetchSubtasks();
    },
    onError: error => {
      toast.error(error.message || "添加子任务失败");
    },
  });

  const updateSubtaskMutation = trpc.subtasks.updateStatus.useMutation({
    onSuccess: () => {
      refetchSubtasks();
    },
    onError: error => {
      toast.error(error.message || "更新子任务失败");
    },
  });

  const createCommentMutation = trpc.comments.create.useMutation({
    onSuccess: () => {
      toast.success("评论发送成功");
      setNewComment("");
      refetchComments();
    },
    onError: error => {
      toast.error(error.message || "发送评论失败");
    },
  });

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) {
      toast.error("请输入子任务标题");
      return;
    }

    createSubtaskMutation.mutate({
      taskId,
      title: newSubtaskTitle,
    });
  };

  const handleAddComment = () => {
    if (!newComment.trim()) {
      toast.error("请输入评论内容");
      return;
    }

    createCommentMutation.mutate({
      taskId,
      content: newComment,
    });
  };

  const handleToggleSubtask = (subtaskId: number, completed: boolean) => {
    updateSubtaskMutation.mutate({
      subtaskId,
      completed: !completed,
    });
  };

  if (!isOpen) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg lg:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>任务详情</SheetTitle>
          <SheetDescription>查看和管理任务的所有信息</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : task ? (
          <div className="space-y-6 mt-6">
            {/* Task Title */}
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {task.title}
              </h2>
              {task.description && (
                <p className="text-muted-foreground mt-2">{task.description}</p>
              )}
            </div>

            {/* Task Info */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="bg-muted">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">优先级</p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {task.priority}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-muted">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">截止日期</p>
                  <p className="text-sm font-semibold text-foreground mt-1">
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString("zh-CN")
                      : "未设置"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="subtasks" className="w-full">
              <TabsList className="grid w-full grid-cols-3 bg-muted">
                <TabsTrigger value="subtasks">子任务</TabsTrigger>
                <TabsTrigger value="comments">评论</TabsTrigger>
                <TabsTrigger value="files">附件</TabsTrigger>
              </TabsList>

              {/* Subtasks Tab */}
              <TabsContent value="subtasks" className="space-y-4 mt-4">
                <div className="space-y-2">
                  {subtasks && subtasks.length > 0 ? (
                    subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                      >
                        <Checkbox
                          checked={subtask.completed}
                          onCheckedChange={() =>
                            handleToggleSubtask(subtask.id, subtask.completed)
                          }
                        />
                        <span
                          className={`flex-1 text-sm ${
                            subtask.completed
                              ? "line-through text-muted-foreground"
                              : "text-foreground"
                          }`}
                        >
                          {subtask.title}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      暂无子任务
                    </p>
                  )}
                </div>

                {/* Add Subtask */}
                <div className="flex gap-2">
                  <Input
                    placeholder="添加新的子任务..."
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyPress={e => {
                      if (e.key === "Enter") handleAddSubtask();
                    }}
                  />
                  <Button
                    onClick={handleAddSubtask}
                    disabled={createSubtaskMutation.isPending}
                    size="sm"
                    className="bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Comments Tab */}
              <TabsContent value="comments" className="space-y-4 mt-4">
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {comments && comments.length > 0 ? (
                    comments.map(comment => (
                      <Card key={comment.id} className="bg-muted">
                        <CardContent className="pt-4">
                          <p className="text-xs text-muted-foreground">
                            评论者 ID: {comment.authorId}
                          </p>
                          <p className="text-sm text-foreground mt-2">
                            {comment.content}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {new Date(comment.createdAt).toLocaleString(
                              "zh-CN"
                            )}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      暂无评论
                    </p>
                  )}
                </div>

                {/* Add Comment */}
                <div className="space-y-2">
                  <Textarea
                    placeholder="添加评论..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    className="min-h-20"
                  />
                  <Button
                    onClick={handleAddComment}
                    disabled={createCommentMutation.isPending}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    发送评论
                  </Button>
                </div>
              </TabsContent>

              {/* Files Tab */}
              <TabsContent value="files" className="space-y-4 mt-4">
                {files && files.length > 0 ? (
                  <div className="space-y-2">
                    {files.map(file => (
                      <Card key={file.id} className="bg-muted">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {file.fileName}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {file.fileSize
                                  ? (file.fileSize / 1024).toFixed(2)
                                  : "0"}{" "}
                                KB
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                window.open(file.fileUrl, "_blank");
                              }}
                            >
                              下载
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    暂无附件
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <p className="text-muted-foreground mt-6">任务未找到</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
