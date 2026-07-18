import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { storeAuth } from "@/_core/hooks/useAuth";
import { Loader2, Mail, Lock, User as UserIcon, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loginMut = trpc.auth.login.useMutation();
  const registerMut = trpc.auth.register.useMutation();

  const loading = loginMut.isPending || registerMut.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (mode === "register") {
        if (!name.trim() || name.length < 2) {
          setError("用户名至少 2 个字符");
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError("请输入有效邮箱");
          return;
        }
        const pwRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;
        if (!pwRegex.test(password)) {
          setError("密码至少 12 位，需包含大写字母、小写字母、数字");
          return;
        }
        await registerMut.mutateAsync({ name, email, password });
        setSuccess("注册成功！正在切换到登录…");
        setTimeout(() => {
          setMode("login");
          setPassword("");
          setSuccess("");
        }, 1200);
        return;
      }

      // login
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("请输入有效邮箱");
        return;
      }
      if (!password) {
        setError("请输入密码");
        return;
      }
      const result = await loginMut.mutateAsync({ email, password });
      storeAuth(result.token, result.user);
      // 登录后跳回原页面
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      const safe =
        redirect &&
        redirect.startsWith("/") &&
        !redirect.startsWith("//") &&
        !redirect.includes("@") &&
        !/^https?:/i.test(redirect)
          ? redirect
          : "/";
      window.location.href = safe;
    } catch (e: any) {
      // trpc errors 嵌套在 data 或 error 中
      const msg =
        e?.message || e?.data?.message || e?.error?.json?.message || "操作失败";
      setError(typeof msg === "string" ? msg : "操作失败");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-purple-50/30 p-4">
      <div className="w-full max-w-sm">
        {/* Logo + Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xl font-bold shadow-lg shadow-indigo-500/30 mb-4">
            C
          </div>
          <h1 className="text-2xl font-bold text-gray-900">CHRONOS</h1>
          <p className="text-sm text-gray-500 mt-1">
            任务管理 · 财务核算 · 团队协作
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100 p-6">
          {/* Tabs */}
          <div className="flex p-1 bg-gray-100 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setSuccess("");
              }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === "login"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError("");
                setSuccess("");
              }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === "register"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === "register" && (
              <Field
                icon={<UserIcon size={16} />}
                placeholder="用户名（至少 2 字）"
                value={name}
                onChange={setName}
              />
            )}
            <Field
              icon={<Mail size={16} />}
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={setEmail}
            />
            <Field
              icon={<Lock size={16} />}
              type="password"
              placeholder={
                mode === "register"
                  ? "密码（至少 12 位，含大小写字母+数字）"
                  : "密码"
              }
              value={password}
              onChange={setPassword}
            />

            {(error || success) && (
              <div
                className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                  success
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-600"
                }`}
              >
                {success && <Sparkles size={14} />}
                <span>{success || error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 mt-1"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {mode === "login" ? "登录" : "创建账号"}
            </button>

            {mode === "login" && (
              <p className="text-center mt-3">
                <a
                  href="/auth/reset-password"
                  className="text-xs text-indigo-600 hover:text-indigo-800"
                >
                  忘记密码？
                </a>
              </p>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          企业微信机器人：发送{" "}
          <code className="px-1.5 py-0.5 bg-gray-100 rounded">
            /login 验证码
          </code>{" "}
          绑定账号
        </p>
      </div>
    </div>
  );
}

function Field({
  icon,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white transition-all"
        placeholder={placeholder}
      />
    </div>
  );
}
