// HTTP 中间件 — V3.8 安全/可观测性（可单测）
// 把 request-id 与 security-headers 抽成独立函数，便于在测试中构造 mini-app 断言，
// 也避免 server/_core/index.ts 过度臃肿。
import type { RequestHandler } from "express";
import helmet from "helmet";
import crypto from "crypto";
import { runWithRequest, type RequestWithRequestId } from "./request-context";

/**
 * Request ID 中间件：
 * - 优先复用客户端传入的 x-request-id（链路透传）
 * - 否则生成 UUID
 * - 通过响应头 x-request-id 回传
 * - 用 AsyncLocalStorage 让下游日志自动带上 requestId
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = (req.headers["x-request-id"] as string | undefined)
    ?.toString()
    .slice(0, 64);
  const requestId =
    incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
  (req as RequestWithRequestId).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  runWithRequest({ requestId }, () => next());
};

/**
 * 安全头中间件（在 helmet 基础上追加 Referrer-Policy / COOP / Permissions-Policy）。
 * helmet 已默认启用：HSTS、X-Content-Type-Options、X-Frame-Options(frameAncestors none)、CSP。
 */
export function createSecurityHeadersMiddleware(): RequestHandler {
  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["'self'"],
        frameAncestors: ["'self'"],  // v3.9.2: 允许同域PDF预览iframe
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        connectSrc: [
          "'self'",
          process.env.APP_URL || "https://chronos.owain32380.cn",
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
  });

  return (req, res, next) => {
    helmetMiddleware(req, res, () => {
      res.setHeader(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
      );
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      next();
    });
  };
}
