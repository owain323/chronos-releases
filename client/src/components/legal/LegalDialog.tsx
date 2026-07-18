/**
 * LegalDialog — 隐私政策 + 服务条款 弹窗
 * 长内容可滚动、tab 切换、清晰关闭按钮
 */
import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ScrollText, FileText } from "lucide-react";

interface LegalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "privacy" | "terms";
}

function LegalContent({ src }: { src: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setHtml(null);
    setError(false);
    fetch(src)
      .then(r => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then(html => {
        const m = html.match(/<body>([\s\S]*)<\/body>/);
        setHtml(m ? m[1] : html);
      })
      .catch(() => setError(true));
  }, [src]);

  if (error) {
    return (
      <div className="text-center py-8 text-gray-500 space-y-2">
        <p>加载失败</p>
        <p className="text-xs">
          请访问{" "}
          <a
            href={src}
            className="text-sky-600 underline"
            target="_blank"
            rel="noreferrer"
          >
            {src}
          </a>
        </p>
      </div>
    );
  }
  if (!html) {
    return (
      <div className="space-y-3 p-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }
  return (
    <div
      className="prose prose-sm prose-slate max-w-none
        [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-3
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-gray-800
        [&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-gray-700
        [&_ul]:mb-3 [&_ul]:pl-5 [&_li]:mb-1 [&_li]:text-gray-700
        [&_strong]:text-gray-900 [&_a]:text-sky-600 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
}

export function LegalDialog({
  open,
  onOpenChange,
  defaultTab = "privacy",
}: LegalDialogProps) {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"privacy" | "terms">(defaultTab);

  // 同步 tab 到 defaultTab（当外部切换时）
  useEffect(() => {
    if (open) setTab(defaultTab);
  }, [open, defaultTab]);

  const openFullPage = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            法律文档
          </DialogTitle>
          <DialogDescription className="text-xs">请仔细阅读</DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={v => setTab(v as any)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mt-3 grid grid-cols-2">
            <TabsTrigger value="privacy" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              隐私政策
            </TabsTrigger>
            <TabsTrigger value="terms" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              服务条款
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="privacy" className="m-0">
              <LegalContent src="/privacy.html" />
              <div className="mt-4 pt-3 border-t flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFullPage("/privacy")}
                >
                  查看完整页面 →
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="terms" className="m-0">
              <LegalContent src="/terms.html" />
              <div className="mt-4 pt-3 border-t flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFullPage("/terms")}
                >
                  查看完整页面 →
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
