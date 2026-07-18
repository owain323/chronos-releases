/**
 * ProjectDeleteDialog — 删除项目（极度严肃操作）
 * 必须输入项目名称确认 + 警告说明
 * 类比注销账户的 UX 标准
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function ProjectDeleteDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  onDeleted,
}: {
  projectId: number;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");

  const del = trpc.projects.delete.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onDeleted();
      toast.success(`项目「${projectName}」已删除`);
    },
    onError: e => toast.error(`删除失败: ${e.message}`),
  });

  const confirmed = confirmName.trim() === projectName;

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) setConfirmName("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            删除项目
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2">
            <p className="text-red-700 font-medium">此操作不可撤销。</p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-2">
              <p>
                <strong>将要删除：</strong>「{projectName}」
              </p>
              <p>
                <strong>受影响的数据：</strong>
              </p>
              <ul className="list-disc pl-4 space-y-0.5 text-red-700">
                <li>该项目内所有任务</li>
                <li>该项目内所有成本/收入记录</li>
                <li>该项目内所有供应商/客户联系人</li>
                <li>该项目所有上传文件</li>
              </ul>
              <p className="text-xs text-red-500">
                数据执行软删除（标记为 archived），可在 30 天内联系管理员恢复。
              </p>
            </div>
            <div className="pt-2">
              <Label className="text-sm">
                请输入项目名称{" "}
                <strong className="text-red-600">「{projectName}」</strong>{" "}
                以确认删除：
              </Label>
              <Input
                value={confirmName}
                onChange={e => setConfirmName(e.target.value)}
                placeholder={projectName}
                className="mt-1.5 border-red-200 focus:border-red-400"
                autoFocus
              />
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setConfirmName("");
            }}
          >
            取消
          </Button>
          <Button
            onClick={() => del.mutate({ projectId, confirmName })}
            disabled={!confirmed || del.isPending}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {del.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Trash2 className="h-4 w-4 mr-1" /> 确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
