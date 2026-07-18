/**
 * TermsPage — 服务条款
 * 从 /terms.html 静态文件加载内容，用 ChronosLayout 包裹
 */
import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Skeleton } from "@/components/ui/skeleton";

export default function TermsPage() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/terms.html")
      .then(r => {
        if (!r.ok) throw new Error();
        return r.text();
      })
      .then(html => {
        const m = html.match(/<body>([\s\S]*)<\/body>/);
        setHtml(m ? m[1] : html);
      })
      .catch(() => setError(true));
  }, []);

  return (
    <ChronosLayout title="服务条款">
      <div className="max-w-3xl mx-auto py-8 px-4">
        {error ? (
          <div className="text-center py-12 text-gray-500 space-y-2">
            <p>加载失败</p>
            <p className="text-xs">
              请访问{" "}
              <a href="/terms.html" className="text-sky-600 underline">
                /terms.html
              </a>{" "}
              查看完整内容
            </p>
          </div>
        ) : !html ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <div
            className="prose prose-sm prose-slate max-w-none
              [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4
              [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-gray-800
              [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-gray-700
              [&_ul]:mb-4 [&_ul]:pl-6 [&_li]:mb-1 [&_li]:text-gray-700
              [&_strong]:text-gray-900 [&_a]:text-sky-600 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
          />
        )}
      </div>
    </ChronosLayout>
  );
}
