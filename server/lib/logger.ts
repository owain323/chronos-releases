import pino from "pino";
import { getRequestId } from "./request-context";

const isProd = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  transport: isProd
    ? undefined // production: JSON to stdout
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss" },
      },
});

/** 返回带 requestId 的子 logger（自动关联当前请求链路） */
export function reqLogger() {
  const rid = getRequestId();
  return rid ? logger.child({ requestId: rid }) : logger;
}

export function logAudit(opts: {
  userId: number;
  action: string;
  entity: string;
  entityId: number;
}) {
  logger.info(
    { type: "audit", ...opts, timestamp: new Date().toISOString() },
    `audit: ${opts.action} ${opts.entity}#${opts.entityId}`
  );
}
