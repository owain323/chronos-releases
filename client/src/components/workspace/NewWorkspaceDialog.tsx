/**
 * NewWorkspaceDialog — 创建新工作区
 * shadcn Dialog + Input + Button
 * 自动生成 slug, 用户可改
 * 创建后回调 onCreated(id)
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
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "workspace"
  );
}

interface NewWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (workspaceId: number) => void;
}

export function NewWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: NewWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);

  useEffect(() => {
    if (autoSlug) setSlug(slugify(name));
  }, [name, autoSlug]);

  useEffect(() => {
    if (!open) {
      setName("");
      setSlug("");
      setAutoSlug(true);
    }
  }, [open]);

  const create = trpc.workspaces.create.useMutation({
    onSuccess: ws => {
      if (ws?.id) onCreated(ws.id);
      toast.success(`工作区「${ws?.name || name}」已创建`);
    },
    onError: e => toast.error(`创建失败: ${e.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate({
      name: name.trim(),
      slug: autoSlug ? undefined : slug.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-sky-600" />
              新建工作区
            </DialogTitle>
            <DialogDescription>
              工作区是项目、任务和财务数据的最高隔离边界。创建后你将自动成为该工作区的
              Owner。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ws-name">名称</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="例如：海之兴工作室"
                autoFocus
                maxLength={255}
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="ws-slug"
                className="flex items-center justify-between"
              >
                <span>URL 标识</span>
                <label className="flex items-center gap-1.5 text-xs font-normal text-gray-500">
                  <input
                    type="checkbox"
                    checked={autoSlug}
                    onChange={e => setAutoSlug(e.target.checked)}
                    className="rounded"
                  />
                  自动生成
                </label>
              </Label>
              <Input
                id="ws-slug"
                value={slug}
                onChange={e => {
                  setSlug(e.target.value);
                  setAutoSlug(false);
                }}
                placeholder="haizhixing"
                disabled={autoSlug}
                maxLength={64}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
