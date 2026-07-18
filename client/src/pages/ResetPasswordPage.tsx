import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Mail,
  Lock,
  Key,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from "lucide-react";

export default function ResetPasswordPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialEmail = urlParams.get("email") || "";
  const initialToken = urlParams.get("token") || "";

  const [step, setStep] = useState<"email" | "reset">(
    initialEmail && initialToken ? "reset" : "email"
  );
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState("");

  const forgotPw = trpc.auth.forgotPassword.useMutation({
    onSuccess: () => {
      toast.success("重置链接已发送到您的邮箱");
      if (email) {
        setStep("reset");
      }
    },
    onError: (e: any) => toast.error(e?.message || "发送失败"),
  });

  const resetPw = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("密码重置成功，请使用新密码登录");
      setTimeout(() => (window.location.href = "/"), 1500);
    },
    onError: (e: any) => toast.error(e?.message || "重置失败"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-purple-50/30 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xl font-bold shadow-lg shadow-indigo-500/30 mb-4">
            C
          </div>
          <h1 className="text-2xl font-bold text-gray-900">找回密码</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 p-6">
          {step === "email" ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                输入注册邮箱，我们将发送重置链接。
              </p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="注册邮箱"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <button
                onClick={() => email && forgotPw.mutate({ email })}
                disabled={forgotPw.isPending || !email}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {forgotPw.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                发送重置链接 <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
                请检查邮箱获取重置码，在下方输入新密码完成重置。
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="邮箱"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="邮箱中的重置码"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="password"
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="新密码（12位+大小写+数字）"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <button
                onClick={() =>
                  email &&
                  token &&
                  newPassword &&
                  resetPw.mutate({ email, token, newPassword })
                }
                disabled={resetPw.isPending || !email || !token || !newPassword}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetPw.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                重置密码
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          <a href="/" className="text-indigo-600 hover:text-indigo-800">
            返回登录
          </a>
        </p>
      </div>
    </div>
  );
}
