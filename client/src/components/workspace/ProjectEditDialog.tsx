/**
 * ProjectEditDialog — 编辑项目名称和描述
 * 仅 owner/admin 可见编辑按钮
 */
import { useState, useEffect } from "react";
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
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

export function ProjectEditDialog({
  projectId,
  currentName,
  currentDescription,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: number;
  currentName: string;
  currentDescription?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [desc, setDesc] = useState(currentDescription || "");

  useEffect(() => {
    if (open) {
      setName(currentName);
      setDesc(currentDescription || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form on open only
  }, [open]);

  const upd = trpc.projects.update.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
      toast.success("项目已更新");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            编辑项目
          </DialogTitle>
          <DialogDescription>修改项目名称和描述</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>名称</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>描述</Label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => upd.mutate({ projectId, name, description: desc })}
            disabled={!name.trim() || upd.isPending}
          >
            {upd.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
