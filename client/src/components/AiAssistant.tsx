import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Bot,
  Send,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface AiAssistantProps {
  projectId?: number;
  workspaceId?: number;
}

export default function AiAssistant({
  projectId,
  workspaceId: wsProp,
}: AiAssistantProps) {
  const workspaceId =
    wsProp ||
    (() => {
      try {
        const v = localStorage.getItem("currentWorkspaceId");
        return v ? parseInt(v, 10) : 0;
      } catch {
        return 0;
      }
    })();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<"input" | "review" | "result">("input");
  const [runId, setRunId] = useState<number | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [execResult, setExecResult] = useState<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();

  const planMutation = trpc.ai.plan.useMutation({
    onSuccess: data => {
      setRunId(data.runId);
      setPlan(data.plan);
      setStep("review");
    },
    onError: (e: any) => {
      toast.error(e?.message || "AI 规划失败，请检查 LLM 配置");
    },
  });

  const confirmMutation = trpc.ai.confirm.useMutation({
    onSuccess: data => {
      setExecResult(data);
      setStep("result");
    },
    onError: (e: any) => {
      toast.error(e?.message || "执行失败");
    },
  });

  const cancelMutation = trpc.ai.cancel.useMutation();

  const handlePlan = () => {
    if (!prompt.trim()) return;
    if (!workspaceId) {
      toast.error("未选择工作区");
      return;
    }
    planMutation.mutate({ prompt: prompt.trim(), workspaceId, projectId });
  };

  const handleConfirm = () => {
    if (!runId) return;
    confirmMutation.mutate({ runId });
  };

  const handleCancel = () => {
    if (!runId) return;
    cancelMutation.mutate({ runId });
    setStep("input");
    setPrompt("");
    setRunId(null);
    setPlan(null);
    setExecResult(null);
  };

  const handleReset = () => {
    setStep("input");
    setPrompt("");
    setRunId(null);
    setPlan(null);
    setExecResult(null);
  };

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open, step]);

  return (
    <>
      {/* 浮动按钮 */}
      <Button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-sky-600 hover:bg-sky-700 text-white p-0"
        title="AI 助手"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </Button>

      {/* 面板 */}
      {open && (
        <Card className="fixed bottom-20 right-6 z-50 w-96 max-h-[70vh] overflow-auto shadow-xl border-gray-200">
          <CardHeader className="border-b pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-sky-600" />
              AI 助手
              <Badge variant="outline" className="text-xs ml-auto">
                Beta
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* ─── Step: Input ─── */}
            {step === "input" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">
                  用自然语言描述你想做什么，我会生成执行计划。
                </p>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>例如：</p>
                  <p>&nbsp;• "帮我建个网站项目，含首页和登录两个任务"</p>
                  <p>&nbsp;• "在XX项目中创建3个任务：需求分析、UI设计、开发"</p>
                  <p>&nbsp;• "录入一笔5000元的服务器租赁成本"</p>
                </div>
                <Textarea
                  ref={textareaRef}
                  placeholder="输入你的需求..."
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePlan();
                    }
                  }}
                  rows={3}
                  className="resize-none"
                />
                <Button
                  onClick={handlePlan}
                  disabled={planMutation.isPending || !prompt.trim()}
                  className="w-full gap-2 bg-sky-600 hover:bg-sky-700 text-white"
                >
                  {planMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {planMutation.isPending ? "AI 思考中..." : "生成计划"}
                </Button>
                <p className="text-[10px] text-gray-300">
                  需要配置 OPENAI_API_KEY（支持 DeepSeek/Qwen/Moonshot）
                </p>
              </div>
            )}

            {/* ─── Step: Review ─── */}
            {step === "review" && plan && (
              <div className="space-y-3">
                <div className="rounded-lg bg-sky-50 p-3 text-sm">
                  <p className="font-medium text-sky-800">AI 分析</p>
                  <p className="mt-1 text-sky-700">{plan.reasoning_summary}</p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">
                    执行计划 ({plan.commands?.length || 0} 条命令)
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-auto">
                    {plan.commands?.map((cmd: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded border border-gray-100 bg-gray-50 p-2 text-xs"
                      >
                        <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded bg-sky-100 text-[10px] font-medium text-sky-700">
                          {i + 1}
                        </span>
                        <div className="flex-1">
                          <span className="font-medium text-gray-700">
                            {cmd.action}
                          </span>
                          <span className="text-gray-400 ml-1">
                            {JSON.stringify(cmd.params)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleConfirm}
                    disabled={confirmMutation.isPending}
                    className="flex-1 gap-2 bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {confirmMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    确认执行
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="outline"
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    取消
                  </Button>
                </div>
              </div>
            )}

            {/* ─── Step: Result ─── */}
            {step === "result" && execResult && (
              <div className="space-y-3">
                <div
                  className={`rounded-lg p-3 text-sm ${
                    execResult.status === "completed"
                      ? "bg-green-50 text-green-800"
                      : execResult.status === "failed"
                        ? "bg-red-50 text-red-800"
                        : "bg-amber-50 text-amber-800"
                  }`}
                >
                  <p className="font-medium flex items-center gap-1">
                    {execResult.status === "completed" && (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {execResult.status === "failed" && (
                      <XCircle className="h-4 w-4" />
                    )}
                    {execResult.status === "pending_approval" && (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    {execResult.status === "completed"
                      ? `成功执行 ${execResult.successCount} 条命令`
                      : execResult.status === "failed"
                        ? "执行失败"
                        : "部分命令需审批"}
                  </p>
                </div>

                {execResult.results?.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {execResult.results.map((r: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded border border-gray-100 p-2 text-xs"
                      >
                        {r.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : r.approvalRequired ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                        )}
                        <span className="font-medium">{r.action}</span>
                        {r.error && (
                          <span className="text-red-500 ml-1">{r.error}</span>
                        )}
                        {r.result?.projectId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-auto p-0 text-xs text-sky-600 ml-auto"
                            onClick={() =>
                              navigate(`/projects/${r.result.projectId}`)
                            }
                          >
                            查看
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {execResult.errors?.length > 0 && (
                  <div className="rounded bg-red-50 p-2 text-xs text-red-700">
                    {execResult.errors.map((e: string, i: number) => (
                      <p key={i}>{e}</p>
                    ))}
                  </div>
                )}

                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="w-full"
                >
                  新对话
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
