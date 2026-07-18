/**
 * Sentry 错误追踪 — 仅 production 且 SENTRY_DSN 配置时启用
 * 使用: initSentry(app) 在 server/_core/index.ts 中调用
 *
 * 企微告警去重: Sentry 自带 issue grouping,
 *   同一个错误类型+堆栈归为一个 issue, 不会重复告警
 */
import type { Express } from "express";

type SentryModule = typeof import("@sentry/node");

let sentryModule: SentryModule | null = null;

export async function initSentry(app: Express) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // 未配置 DSN, 静默跳过

  try {
    const Sentry = await import("@sentry/node");
    const { nodeProfilingIntegration } = await import("@sentry/profiling-node");

    Sentry.init({
      dsn,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: process.env.NODE_ENV || "development",
      release: process.env.APP_VERSION || "unknown",
      // v4.3 WO-SEC-5: 脱敏 Authorization/cookie/IP 防 PII 外传
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
          delete event.request.headers["x-workspace-id"];
        }
        if (event.user?.ip_address) {
          event.user.ip_address = "0.0.0.0";
        }
        return event;
      },
    });

    sentryModule = Sentry;

    // 兜底：若调用方忘记在所有路由之后调用 mountSentryErrorHandler，
    // 这里不挂载（错误处理器必须注册在全部路由/middleware 之后才生效）。
    void app;
    console.warn("[sentry] Initialized (error handler pending mount)");
  } catch (err) {
    // v3.8 安全修复: 初始化失败从 warn 升级为 error 级日志
    console.error("[sentry] Failed to initialize:", err);
  }
}

/**
 * 挂载 Sentry Express 错误处理器。
 * 必须在所有路由与 middleware 注册完成之后调用（Express 错误中间件按注册顺序生效）。
 * Sentry v8+ 正确签名: Sentry.setupExpressErrorHandler(app)
 */
export function mountSentryErrorHandler(app: Express): void {
  if (!sentryModule) return; // 未初始化（无 DSN 或初始化失败），静默跳过
  try {
    sentryModule.setupExpressErrorHandler(app);
  } catch (err) {
    console.error("[sentry] Failed to mount error handler:", err);
  }
}
