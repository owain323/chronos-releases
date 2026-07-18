// OpenTelemetry 全链路追踪 — L1
// 通过环境变量控制: OTEL_ENABLED=true 启动追踪
// 所有 OTel 导入均为动态 — 包未安装时静默跳过，不阻塞启动
// 默认 dev 环境输出到 console, prod 通过 OTEL_EXPORTER_OTLP_ENDPOINT 发送到 Collector

/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { createRequire } from "module";
const _require = createRequire(import.meta.url);

let sdk: any = null;

export function initTelemetry() {
  const enabled = process.env.OTEL_ENABLED === "true";
  if (!enabled) return null;

  // 动态加载所有包 — 任一缺失则降级跳过
  let NodeSDK: any, getNodeAutoInstrumentations: any;
  let OTLPTraceExporter: any, ConsoleSpanExporter: any, Resource: any;
  let diag: any, DiagConsoleLogger: any, DiagLogLevel: any;
  let ATTR_SERVICE_NAME: any, ATTR_SERVICE_VERSION: any;

  try {
    ({ NodeSDK } = _require("@opentelemetry/sdk-node"));
    ({ getNodeAutoInstrumentations } = _require(
      "@opentelemetry/auto-instrumentations-node"
    ));
    ({ OTLPTraceExporter } = _require(
      "@opentelemetry/exporter-trace-otlp-http"
    ));
    ({ ConsoleSpanExporter } = _require("@opentelemetry/sdk-trace-base"));
    ({ Resource } = _require("@opentelemetry/resources"));
    ({ ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = _require(
      "@opentelemetry/semantic-conventions"
    ));
    ({ diag, DiagConsoleLogger, DiagLogLevel } =
      _require("@opentelemetry/api"));
  } catch {
    console.warn(
      "[otel] Packages not installed, tracing disabled. Install: npm i @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http"
    );
    return null;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || "chronos";
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const isDev = process.env.NODE_ENV === "development";

  const traceExporter = otlpEndpoint
    ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
    : isDev
      ? new ConsoleSpanExporter()
      : undefined;

  if (!traceExporter) {
    console.warn("[otel] No exporter configured, traces will be dropped");
    return null;
  }

  if (isDev) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "1.0.0",
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": { enabled: true },
        "@opentelemetry/instrumentation-express": { enabled: true },
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-pino": { enabled: true },
        "@opentelemetry/instrumentation-better-sqlite3": { enabled: true },
      }),
    ],
  });

  sdk.start();
  console.log(
    `[otel] Tracing enabled (service=${serviceName}, endpoint=${otlpEndpoint || "console"})`
  );

  process.on("SIGTERM", () => {
    sdk?.shutdown().then(() => console.log("[otel] Shutdown complete"));
  });

  return sdk;
}

export function shutdownTelemetry(): Promise<void> {
  return sdk?.shutdown() ?? Promise.resolve();
}
