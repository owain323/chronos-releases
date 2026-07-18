/* eslint-disable @typescript-eslint/no-explicit-any -- v3.6-iam W2: 历史遗留 */
import "dotenv/config";
import express from "express";
import type { Express } from "express";
import cookieParser from "cookie-parser";
import compression from "compression";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { validateMagicByte } from "../lib/magic-byte";
import { ALLOWED_EXT, ALLOWED_MIME } from "../lib/storage";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { logger } from "../lib/logger";
import { initSentry, mountSentryErrorHandler } from "../lib/sentry";
import { checkRateLimit } from "../lib/rate-limit";
import {
  requestIdMiddleware,
  createSecurityHeadersMiddleware,
} from "../lib/http-middlewares";
// L1: OTel — 按需动态导入（包未安装时静默跳过，不阻塞启动）
let initTelemetryFn: (() => any) | null = null;
async function loadTelemetry() {
  if (process.env.OTEL_ENABLED !== "true") return;
  try {
    const mod = await import("../lib/telemetry");
    initTelemetryFn = mod.initTelemetry;
  } catch {
    /* OTel packages not installed */
  }
}
import { sloMiddleware, getSloSnapshot, getSloViolations } from "../lib/slo";
import { getEnabledFeatures, listFeatureFlags } from "../lib/feature-flags";
import { serveStatic, setupVite } from "./vite";
import { handleBotCallback } from "../lib/bot-service";
import { redeemShareCode } from "../lib/bot/file-share";
import { renderFilePreview } from "../lib/bot/file-preview";
import { resolveShortLink } from "../lib/bot/short-link";
import { verifyToken } from "../routers/auth";
import { requireSystemAccess } from "../lib/system-access";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 项目根目录：开发环境在 server/_core/ 下（上两级），生产构建在 dist/ 下（上一级）
const ROOT_DIR = fs.existsSync(path.join(__dirname, "..", "package.json"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(ROOT_DIR, "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createApp(): Promise<{
  app: Express;
  server: import("http").Server;
}> {
  const app = express();
  app.use(cookieParser());
  app.use(requestIdMiddleware); // V3.8: request-id 注入 + 日志链路关联
  await loadTelemetry(); // L1: 按需加载 OTel 模块
  initTelemetryFn?.(); // L1: OpenTelemetry 全链路追踪（OTEL_ENABLED=true + 包已安装时启用）
  app.use(sloMiddleware); // L5: SLO 指标收集（在 Sentry 之前）
  await initSentry(app); // 错误追踪 (SENTRY_DSN 未配置时静默跳过)
  const server = createServer(app);
  // 健康检查
  app.get("/api/health", async (_req, res) => {
    try {
      const { db, sql } = await import("../db/connection");
      db.all(sql.raw("SELECT 1"));
      res.json({
        ok: true,
        db: "connected",
        uptime: Math.floor(process.uptime()),
      });
    } catch (e: unknown) {
      res
        .status(503)
        .json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // L2: Feature Flag API — 客户端查询启用的 feature 列表
  // v3.8 安全修复: 要求认证; userId 查询参数只能等于当前登录用户 id, 否则 403
  app.get("/api/feature-flags", async (req, res) => {
    try {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: "Invalid token" });
      }
      if (req.query.userId !== undefined) {
        const requestedUserId = parseInt(req.query.userId as string, 10);
        if (
          !Number.isFinite(requestedUserId) ||
          requestedUserId !== payload.uid
        ) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const flags = await getEnabledFeatures(payload.uid);
      res.json(flags);
    } catch {
      res.json([]);
    }
  });

  // L2: Feature Flag 管理 API（需系统权限）
  app.get("/api/feature-flags/admin", async (req, res) => {
    try {
      // 从 cookie 提取 JWT 并验证
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const payload = verifyToken(token);
      if (!payload) {
        return res.status(401).json({ error: "Invalid token" });
      }
      await requireSystemAccess(payload.uid, "SYSTEM_OWNER");
      const flags = await listFeatureFlags();
      res.json(flags);
    } catch (e: any) {
      if (e?.code === "FORBIDDEN") {
        res.status(403).json({ error: "Forbidden" });
      } else {
        res.json([]);
      }
    }
  });

  // L5: SLO 指标查询（v3.8 安全修复: 与 /api/ai-usage 同级 SYSTEM_OWNER 门禁）
  app.get("/api/slo", async (req, res) => {
    try {
      const token = req.cookies?.token;
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const payload = verifyToken(token);
      if (!payload) return res.status(401).json({ error: "Invalid token" });
      await requireSystemAccess(payload.uid, "SYSTEM_OWNER");
      const snapshot = getSloSnapshot();
      const violations = getSloViolations();
      res.json({ ...snapshot, violations });
    } catch (e: unknown) {
      if ((e as any)?.code === "FORBIDDEN")
        return res.status(403).json({ error: "Forbidden" });
      res.status(500).json({ error: "Internal" });
    }
  });

  // V3.8: AI Token 使用监控（仅 SYSTEM_OWNER）
  app.get("/api/ai-usage", async (req, res) => {
    try {
      const token = req.cookies?.token;
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const payload = verifyToken(token);
      if (!payload) return res.status(401).json({ error: "Invalid token" });
      await requireSystemAccess(payload.uid, "SYSTEM_OWNER");
      const { getAiUsageSnapshot } = await import("../lib/ai-usage");
      res.json(getAiUsageSnapshot());
    } catch (e: unknown) {
      if ((e as any)?.code === "FORBIDDEN")
        return res.status(403).json({ error: "Forbidden" });
      res.status(500).json({ error: "Internal" });
    }
  });

  // API 文档
  app.get("/api/docs", (req, res) => {
    const text =
      "CHRONOS API Docs\n\n" +
      "健康检查 GET /api/health\n" +
      "登录 POST /api/trpc/auth.login\n" +
      "注册 POST /api/trpc/auth.register\n" +
      "当前用户 GET /api/trpc/auth.me\n" +
      "项目 GET /api/trpc/projects.list\n" +
      "搜索 GET /api/trpc/search.global\n" +
      "文件 GET /api/trpc/files.getByProject\n" +
      "通知 GET /api/trpc/notifications.getByProject\n" +
      "Webhook GET /api/trpc/webhooks.getByProject\n" +
      "Bot POST /api/bot/callback\n";
    res.end(text);
  });

  // Bot 回调路由的 body 解析：必须放在 express.json() 之前
  // express.raw() 对 /api/bot/callback 单独处理，保留原始 body
  app.use("/api/bot/callback", express.raw({ type: "*/*", limit: "1mb" }));

  // cookieParser 已在 L61 全局注册，此处移除重复调用
  // 解析 cookies (用于 /uploads 等浏览器直链访问)
  app.use(express.json({ limit: "50mb" }));
  // cookieParser 已在 L61 全局注册，此处移除重复调用
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(compression()); // gzip 响应压缩

  // 法律页面
  app.get("/privacy", (_req, res) => {
    res.sendFile(
      path.join(
        process.env.NODE_ENV === "production"
          ? process.cwd()
          : path.join(__dirname, "..", ".."),
        "client",
        "public",
        "privacy.html"
      )
    );
  });
  app.get("/terms", (_req, res) => {
    res.sendFile(
      path.join(
        process.env.NODE_ENV === "production"
          ? process.cwd()
          : path.join(__dirname, "..", ".."),
        "client",
        "public",
        "terms.html"
      )
    );
  });

  // 安全头 (V3.8: 抽至 http-middlewares，补全 Referrer-Policy / COOP / Permissions-Policy)
  app.use(createSecurityHeadersMiddleware());

  // Trust proxy — Caddy 转发的请求启用 rate limiter
  app.set("trust proxy", 1);

  // 全局限流（每 IP 每分钟 100 请求）
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "请求过于频繁，请稍后再试" },
    })
  );

  // API 限流: 600/分钟(10/秒) - SPA每页5-15查询, 不能太严
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "API 请求过于频繁，请稍后再试" },
  });
  app.use("/api/", apiLimiter);

  // multer 配置 — 磁盘存储，文件名防冲突
  const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const safeName =
        Date.now() +
        "-" +
        file.originalname.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_");
      cb(null, safeName);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXT.includes(ext))
        return cb(new Error(`后缀 ${ext} 不允许上传`));
      if (ALLOWED_MIME.includes(file.mimetype)) return cb(null, true);
      cb(new Error(`文件类型 ${file.mimetype} 不允许上传`));
    },
  });

  // File upload endpoint (multipart/form-data) — 需要 JWT 认证
  // v3.8 P0 安全修复: 鉴权前置到 multer 落盘之前（此前先落盘后鉴权，未认证请求可写磁盘）。
  // cookieParser 已全局注册，Bearer/cookie 均可在解析 multipart 前完成校验。
  const uploadAuth: express.RequestHandler = async (req, res, next) => {
    try {
      const headerToken = (req.headers.authorization || "").startsWith(
        "Bearer "
      )
        ? req.headers.authorization!.slice(7)
        : "";
      const cookieToken = (req.cookies?.token as string) || "";
      const token = headerToken || cookieToken;
      if (!token) {
        res.status(401).json({ error: "请先登录" });
        return;
      }
      const payload = verifyToken(token);
      if (!payload) {
        res.status(401).json({ error: "登录已过期" });
        return;
      }
      // v3.8: 按用户的上传频率限制（复用 checkRateLimit，key 按 uid 隔离）
      const allowed = await checkRateLimit(`upload:${payload.uid}`);
      if (!allowed) {
        res.status(429).json({ error: "上传过于频繁，请稍后再试" });
        return;
      }
      (req as any).uploadUserId = payload.uid;
      next();
    } catch (e) {
      logger.error({ ctx: "index" }, "[Upload] Auth middleware failed:", e);
      res.status(500).json({ error: "Upload failed" });
    }
  };
  app.post("/api/upload", uploadAuth, upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "未选择文件" });
        return;
      }
      // v3.9.2: magic-byte 二次校验, 拒绝伪造扩展名的文件 (v4.1: 扩至8字节+全类型白名单)
      const head = Buffer.alloc(8);
      const fd = fs.openSync(req.file.path, "r");
      fs.readSync(fd, head, 0, 8, 0);
      fs.closeSync(fd);
      const realType = validateMagicByte(head, ALLOWED_MIME);
      if (!realType) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          /* ignore */
        }
        res
          .status(400)
          .json({ error: "文件类型不支持，仅允许 PNG/JPEG/GIF/PDF" });
        return;
      }
      const safeName = req.file.filename;
      const baseUrl = process.env.APP_URL || `http://localhost:3000`;
      const url = `/uploads/${safeName}`;
      const fullUrl = `${baseUrl}${url}`;
      res.json({
        success: true,
        fileName: safeName,
        fileUrl: url,
        fullUrl: fullUrl,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (e) {
      logger.error({ ctx: "index" }, "[Upload] Failed:", e);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // Serve uploaded files — JWT only (file ownership check disabled for v3.9.1 to fix preview 404)
  // v3.9.1 hotfix: 用户反馈图片/PDF预览全坏, 简化为仅校验JWT
  // TODO v4.0: 恢复项目所有权校验, 但需先修 cookie sameSite + tokenVersion 路径
  app.use(
    "/uploads",
    async (req, res, next) => {
      const auth = req.headers.authorization || "";
      const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const cookieToken = (req.cookies?.token as string) || "";
      const token = headerToken || cookieToken;
      if (!token) return res.status(401).send("Unauthorized");
      const payload = verifyToken(token);
      if (!payload) return res.status(401).send("Token expired");
      return next();
    },
    express.static(UPLOADS_DIR)
  );

  // 短链接跳转：/v/abc123 → /api/view/{fileId}?code={code}
  app.get("/v/:short", (req, res) => {
    const entry = resolveShortLink(req.params.short);
    if (!entry) {
      res.status(404).send("短链无效或已过期");
      return;
    }
    res.redirect(`/api/view/${entry.fileId}?code=${entry.code}`);
  });

  // 文件预览（分享码鉴权）
  app.get("/api/view/:fileId", async (req, res) => {
    try {
      const fileId = parseInt(req.params.fileId, 10);
      const code = req.query.code as string;
      const entry = redeemShareCode(code);
      if (!entry || entry.fileId !== fileId) {
        res.status(403).type("html").send("<h2>分享码无效或已过期</h2>");
        return;
      }
      const file = await import("../db").then(m =>
        m.getFileSnapshotById(fileId)
      );
      if (!file) {
        res.status(404).send("文件不存在");
        return;
      }
      const project = await import("../db").then(m =>
        m.getProjectById(file.projectId as number)
      );
      const baseUrl = process.env.APP_URL || `http://localhost:3006`;
      const fullUrl = (file.fileUrl as string).startsWith("/")
        ? baseUrl + file.fileUrl
        : file.fileUrl;
      res.type("html").send(
        renderFilePreview({
          fileId,
          fileName: file.fileName,
          mimeType: file.mimeType || "",
          fileUrl: fullUrl,
          projectName: project?.name,
          notes: file.notes || undefined,
          size: file.fileSize || undefined,
        })
      );
    } catch (e: unknown) {
      logger.error(
        { ctx: "index" },
        "[View]",
        e instanceof Error ? e.message : String(e)
      );
      res.status(500).send("预览失败");
    }
  });

  // Bot callback endpoint — 接收企业微信/钉钉机器人的消息
  // 同时支持 GET 验证（企微首次配置 URL 时调用）
  app.get("/api/bot/callback", async (req, res) => {
    const { msg_signature: sig, timestamp, nonce, echostr } = req.query;
    const encodingAESKey = process.env.WECOM_ENCODING_AES_KEY;
    const wecomToken = process.env.WECOM_TOKEN;
    if (!encodingAESKey || !wecomToken) {
      res
        .status(500)
        .send("WECOM_ENCODING_AES_KEY or WECOM_TOKEN not configured");
      return;
    }
    try {
      const { decryptWecom } = await import("../lib/bot/wecom-crypto");
      const decrypted = decryptWecom(
        wecomToken,
        encodingAESKey,
        sig as string,
        timestamp as string,
        nonce as string,
        echostr as string
      );
      res.send(decrypted);
    } catch (e: unknown) {
      logger.error(
        { ctx: "index" },
        "[Bot] GET verification failed:",
        e instanceof Error ? e.message : String(e)
      );
      res
        .status(403)
        .send(
          "verification failed: " + (e instanceof Error ? e.message : String(e))
        );
    }
  });

  app.post("/api/bot/callback", async (req, res) => {
    try {
      // req.body 可能是 Buffer（从 express.raw 来）或 object（从 express.json 来）
      const rawStr = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);

      // 解析 body
      let raw: any;
      if (rawStr.trim().startsWith("<xml>")) {
        const encMatch = rawStr.match(
          /<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/
        );
        raw = encMatch ? { encrypt: encMatch[1] } : { content: rawStr };
      } else {
        try {
          raw = JSON.parse(rawStr);
        } catch {
          raw = { text: { content: rawStr } };
        }
      }
      // 自动检测平台
      let platform: "wecom" | "dingtalk" = "wecom";
      if (raw?.senderId || raw?.sessionWebhook) {
        platform = "dingtalk";
      }

      // 企微加密配置（从环境变量读）
      const encodingAESKey = process.env.WECOM_ENCODING_AES_KEY;
      const wecomToken = process.env.WECOM_TOKEN;
      const result = await handleBotCallback({
        platform,
        raw,
        encodingAESKey,
        wecomToken,
        msgSignature: req.query.msg_signature as string,
        // 钉钉验签：sign/timestamp 来自 HTTP header（钉钉官方规范），
        // timestamp 兼容 query 透传；缺失时生产环境 fail-closed 拒绝
        sign: req.headers.sign as string | undefined,
        timestamp: (req.headers.timestamp ?? req.query.timestamp) as
          string | undefined,
        nonce: req.query.nonce as string,
      });
      if (!result) {
        res.json({ reply: "你好！输入 /帮助 查看可用命令。" });
        return;
      }

      // 加密模式：只当企微发来加密消息（body.encrypt）时才加密回复
      if (platform === "wecom" && raw?.encrypt && encodingAESKey) {
        const { encryptWecom, buildWecomReplyXml, buildWecomNewsXml } =
          await import("../lib/bot/wecom-crypto");
        const ts = String(Math.floor(Date.now() / 1000));
        const nonce = crypto.randomBytes(8).toString("hex");

        let replyXml: string;
        if (
          result.reply &&
          typeof result.reply === "object" &&
          ((result.reply as any).isSearch || (result.reply as any).isFileList)
        ) {
          // 搜索/文件列表 → news XML（文件名卡片，URL 隐藏）
          const sr = result.reply as any;
          const articles = sr.articles.map((a: any) => ({
            title: a.title,
            description: a.title,
            url: a.url,
          }));
          articles.unshift({
            title: sr.summary,
            description: sr.summary,
            url: process.env.APP_URL || "https://chronos.owain32380.cn",
          });
          replyXml = buildWecomNewsXml("bot", "user", articles);
        } else {
          const replyText =
            typeof result.reply === "string"
              ? result.reply
              : (result.reply as any)?.summary || String(result.reply || "");
          replyXml = buildWecomReplyXml("bot", "user", replyText);
        }

        const enc = encryptWecom(
          wecomToken || "",
          encodingAESKey,
          replyXml,
          ts,
          nonce
        );
        const out = `<xml><Encrypt><![CDATA[${enc.encrypt}]]></Encrypt><MsgSignature><![CDATA[${enc.signature}]]></MsgSignature><TimeStamp>${enc.timestamp}</TimeStamp><Nonce><![CDATA[${enc.nonce}]]></Nonce></xml>`;
        res.type("application/xml").send(out);
        return;
      }

      // 明文模式
      if (platform === "wecom") {
        // 搜索/文件列表用 news 格式（隐藏 URL，文件名做标题）
        if (
          result.reply &&
          typeof result.reply === "object" &&
          ((result.reply as any).isSearch || (result.reply as any).isFileList)
        ) {
          const sr = result.reply as any;
          const articles = sr.articles.map((a: any) => ({
            title: a.title,
            description: a.title,
            url: a.url,
          }));
          articles.unshift({
            title: sr.summary,
            description: sr.summary,
            url: process.env.APP_URL || "https://chronos.owain32380.cn",
          });
          res.json({ msgtype: "news", news: { articles } });
        } else {
          // 其他命令 → markdown 格式，reply 必须是字符串
          const text =
            typeof result.reply === "string"
              ? result.reply
              : JSON.stringify(result.reply);
          res.json({ msgtype: "markdown", markdown: { content: text } });
        }
      } else {
        res.json({ msgtype: "text", text: { content: result.reply } });
      }
    } catch (e: unknown) {
      logger.error({ ctx: "index" }, "[Bot] Callback error:", e);
      res.status(500).json({ reply: "处理消息时出错" });
    }
  });

  registerStorageProxy(app);
  // OAuth routes removed - running in no-auth mode
  // tRPC API
  app.use(
    "/api/trpc",
    express.json({ limit: "50mb" }),
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path, ctx }) => {
        const rid = (ctx as any)?.requestId;
        logger.error(
          { ctx: "trpc", path, requestId: rid },
          "[tRPC error]",
          path,
          error.message
        );
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // v3.8 安全修复: Sentry 错误处理器必须在所有路由/middleware 注册之后挂载，
  // 否则按 Express 中间件顺序永远捕获不到路由层错误。
  mountSentryErrorHandler(app);

  return { app, server };
}

export async function startServer() {
  const { app, server } = await createApp();

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  let port = preferredPort;

  // v3.8 安全修复: 生产模式端口被占时 fail-fast（静默漂移会导致反代/监控指向错误实例）；
  // dev/test 保持自动换端口行为。
  if (process.env.NODE_ENV === "production") {
    if (!(await isPortAvailable(preferredPort))) {
      logger.error(
        { ctx: "index", port: preferredPort },
        `[startup] Port ${preferredPort} is unavailable in production, exiting`
      );
      process.exit(1);
    }
  } else {
    port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      logger.info(`Port ${preferredPort} is busy, using port ${port} instead`);
    }
  }

  // v3.8 安全修复: /api/admin/deploy-file 端点已删除（设计上的 RCE + 备份顺序颠倒），部署走 CI/CD。

  // v3.1: PG/Redis setup — SYSTEM_OWNER only
  app.post("/api/admin/setup-pg", async (req, res) => {
    try {
      // v3.1 CRITICAL FIX: 加 requireSystemAccess 守卫
      const token = req.headers.authorization?.replace("Bearer ", "") || "";
      const payload = verifyToken(token);
      if (!payload) return res.status(401).json({ error: "Unauthorized" });
      await requireSystemAccess(payload.uid, "SYSTEM_OWNER");
      const { spawnSync } = await import("child_process");
      spawnSync("docker", ["pull", "postgres:16-alpine"], { timeout: 180000 });
      try {
        spawnSync("docker", ["rm", "-f", "chronos-pg"]);
      } catch {
        /* container may not exist */
      }
      spawnSync("docker", [
        "run",
        "-d",
        "--name",
        "chronos-pg",
        "--restart",
        "unless-stopped",
        "-e",
        `POSTGRES_USER=chronos`,
        "-e",
        `POSTGRES_PASSWORD=${process.env.POSTGRES_PASSWORD || crypto.randomBytes(16).toString("hex")}`,
        "-e",
        "POSTGRES_DB=chronos",
        "-p",
        "127.0.0.1:5432:5432",
        "postgres:16-alpine",
      ]);
      res.json({ ok: true, msg: "PG started" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  server.listen(port, () => {
    // logger.info(`Server running on // replaced by logger http://localhost:${port}/`);
    logger.info({ type: "startup", port, env: process.env.NODE_ENV });

    // v4.0: bot inbox TTL cleanup
    import("../db/botInbox").then(({ sweepExpiredInbox }) => {
      const swept = sweepExpiredInbox();
      if (swept > 0)
        logger.info(`[bot-inbox] startup sweep: ${swept} expired files`);
      setInterval(() => {
        const s = sweepExpiredInbox();
        if (s > 0) logger.info(`[bot-inbox] periodic sweep: ${s} expired`);
      }, 60000);
    });
    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`[shutdown] ${signal} received, closing...`);
      server.close(() => {
        logger.info("[shutdown] HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => {
        logger.error({ ctx: "index" }, "[shutdown] forced exit");
        process.exit(1);
      }, 30000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  });
}

// V3.8: 仅在非测试环境自动启动（测试通过 createApp() 自行拉起）
if (process.env.NODE_ENV !== "test") {
  startServer().catch(console.error);
}
