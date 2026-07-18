import { cn } from "@/lib/utils";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8 bg-white">
          <div className="flex flex-col items-center w-full max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
              <AlertTriangle size={32} className="text-red-500" />
            </div>

            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              页面出了点问题
            </h2>
            <p className="text-sm text-gray-500 mb-8">
              我们已记录此错误，请尝试刷新页面或返回首页。
            </p>

            {import.meta.env.DEV && this.state.error && (
              <div className="w-full p-3 mb-6 rounded bg-gray-50 text-left overflow-auto max-h-32">
                <code className="text-xs text-gray-600 whitespace-pre-wrap">
                  {this.state.error.message}
                </code>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
                  "bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                )}
              >
                <RotateCcw size={15} />
                刷新页面
              </button>
              <button
                onClick={() => {
                  window.location.href = "/";
                }}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
                  "border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                )}
              >
                <Home size={15} />
                返回首页
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
