/**
 * Bot Webhook 回调处理器 v3
 * 支持两种模式：
 *   1) 加密模式（企微应用模式，推荐）：POST body 是 JSON 包裹的加密数据
 *   2) 明文模式（老式/钉钉）：POST body 直接是消息对象
 *
 * P0 安全修复：
 *   - 钉钉回调：DINGTALK_SECRET HMAC-SHA256 验签 + 1 小时时间戳防重放窗口；
 *     生产环境未配置 secret 时拒绝处理（fail-closed）。
 *   - 企微明文模式：生产环境禁用（必须走 EncodingAESKey 加密模式）。
 *   - /切换 项目前统一过 assertBotProjectAccess（临时账号与无权项目一律拒绝）。
 */
import crypto from "crypto";
import { executeCommand } from "./executor";
import {
  getOrCreateBotUser,
  redeemAuthCode,
  bindBotUser,
  updateBotContext,
} from "../../db";
import * as db from "../../db";
import { decryptWecom, parseWecomXml } from "./wecom-crypto";
import { logger } from "../logger";
import { assertBotProjectAccess, BotAccessDenied } from "./access";
import { handleBotMedia, buildInboxReply } from "./media-handler";

interface BotCallbackRequest {
  platform: "wecom" | "dingtalk";
  raw: any;
  /** 企微加密配置（从环境变量读） */
  encodingAESKey?: string;
  wecomToken?: string;
  msgSignature?: string;
  timestamp?: string;
  nonce?: string;
  /** 钉钉回调签名（HTTP header `sign`，需路由层透传；未透传时生产 fail-closed） */
  sign?: string;
}

/** 防重放时间戳窗口：1 小时 */
const REPLAY_WINDOW_MS = 60 * 60 * 1000;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** 时间戳归一化为毫秒（钉钉是毫秒，企微是秒） */
function normalizeTsMs(ts: string): number | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

/** 时间戳是否在允许窗口内（防重放） */
function isTimestampFresh(ts: string | undefined | null): boolean {
  if (!ts) return false;
  const ms = normalizeTsMs(ts);
  if (ms === null) return false;
  return Math.abs(Date.now() - ms) <= REPLAY_WINDOW_MS;
}

/**
 * 钉钉回调验签（官方规范）：
 *   stringToSign = timestamp + "\n" + secret
 *   sign = base64( HmacSHA256(stringToSign, secret) )
 * 传入的 sign 可能是 URL-encode 后的形式，先解码再常量时间比对。
 */
export function verifyDingtalkSign(
  secret: string,
  timestamp: string,
  sign: string
): boolean {
  if (!secret || !timestamp || !sign) return false;
  const stringToSign = `${timestamp}\n${secret}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(stringToSign, "utf8")
    .digest("base64");
  let received = sign;
  try {
    received = decodeURIComponent(sign);
  } catch {
    /* 非编码形式则按原样比对 */
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleBotCallback(
  req: BotCallbackRequest
): Promise<{ reply: string } | null> {
  let text = "";
  let platformUserId = "unknown";
  let _fromUser = "";
  const _toUser = "";

  if (req.platform === "wecom") {
    const body = req.raw;

    // 加密模式：body 是 JSON，包含 { encrypt, msg_signature, timestamp, nonce }
    if (body?.encrypt && req.encodingAESKey) {
      // P0: 时间戳窗口校验（防重放）。decryptWecom 内部已做 SHA1 签名校验。
      const ts = req.timestamp || body.timestamp || "";
      if (ts && !isTimestampFresh(ts)) {
        logger.warn(
          { ctx: "bot" },
          "[Bot] 企微回调时间戳超出窗口，疑似重放，已拒绝"
        );
        return { reply: "❌ 请求已过期（时间戳超出允许窗口）。" };
      }
      try {
        const decrypted = decryptWecom(
          req.wecomToken || "",
          req.encodingAESKey,
          req.msgSignature || body.msg_signature || "",
          req.timestamp || body.timestamp || "",
          req.nonce || body.nonce || "",
          body.encrypt
        );
        const parsed = parseWecomXml(decrypted);
        text = parsed.Content || "";
        _fromUser = parsed.FromUserName || "";
        platformUserId = parsed.UserID || parsed.FromUserName || "unknown";

        // v4.0 T2: MsgType 媒体分支 (必须先于 text.trim() 检查)
        const msgType = parsed.MsgType || "";
        if (["image", "file", "voice", "video"].includes(msgType)) {
          const mediaId = parsed.MediaId || "";
          if (!mediaId) return { reply: "❌ 未收到文件，请重新发送。" };
          const ctx = getOrCreateBotUser(req.platform, platformUserId);
          const reply = await handleBotMedia(
            { mediaId, msgType, originalName: parsed.FileName },
            platformUserId,
            ctx.chronosUserId,
            null // workspaceId resolved at /save time via project lookup
          );
          if (reply) return { reply };
          return { reply: buildInboxReply(String(ctx.chronosUserId)) };
        }
      } catch (e) {
        logger.warn({ ctx: "bot" }, `[Bot] 企微解密失败: ${e instanceof Error ? e.message : String(e)} (token=${req.wecomToken?.slice(0,6)}... key=${req.encodingAESKey?.slice(0,6)}...)`);
        return { reply: "❌ 消息解密失败，请检查 EncodingAESKey 配置。" };
      }
    } else {
      // 明文模式（兼容老配置）
      // P0: 明文回调无任何身份凭证，生产环境一律禁用——必须配置
      // WECOM_ENCODING_AES_KEY/WECOM_TOKEN 走加密模式。
      if (isProduction()) {
        logger.warn(
          { ctx: "bot" },
          "[Bot] 生产环境禁止企微明文回调（需配置 WECOM_ENCODING_AES_KEY/WECOM_TOKEN 走加密模式），已拒绝"
        );
        return { reply: "❌ 机器人未启用加密回调模式，请联系管理员配置。" };
      }
      text = body?.text?.content || body?.msg || body?.content || "";
      platformUserId =
        body?.from?.userid || body?.From?.UserId || body?.sender || "unknown";
    }
  } else if (req.platform === "dingtalk") {
    const body = req.raw;

    // P0: 钉钉回调验签。secret 来自环境变量 DINGTALK_SECRET。
    const dingSecret = process.env.DINGTALK_SECRET || "";
    if (!dingSecret) {
      // fail-closed：生产环境未配置 secret 时拒绝处理，防止伪造回调拖库
      if (isProduction()) {
        logger.warn(
          { ctx: "bot" },
          "[Bot] DINGTALK_SECRET 未配置，生产环境拒绝处理钉钉明文回调"
        );
        return { reply: "❌ 机器人未配置签名密钥，请联系管理员。" };
      }
      logger.warn(
        { ctx: "bot" },
        "[Bot] DINGTALK_SECRET 未配置，非生产环境跳过钉钉验签（仅限本地调试）"
      );
    } else {
      // sign/timestamp 优先取路由透传字段，兼容部分网关放进 body 的部署
      const dingTimestamp =
        req.timestamp || String(body?.timestamp ?? body?.Timestamp ?? "");
      const dingSign = req.sign || String(body?.sign ?? "");
      if (!verifyDingtalkSign(dingSecret, dingTimestamp, dingSign)) {
        logger.warn({ ctx: "bot" }, "[Bot] 钉钉回调签名校验失败，已拒绝");
        return { reply: "❌ 签名校验失败。" };
      }
      // 防重放：拒绝偏差超过 1 小时的时间戳
      if (!isTimestampFresh(dingTimestamp)) {
        logger.warn(
          { ctx: "bot" },
          "[Bot] 钉钉回调时间戳超出窗口，疑似重放，已拒绝"
        );
        return { reply: "❌ 请求已过期（时间戳超出允许窗口）。" };
      }
    }

    text = body?.text?.content || body?.msg || "";
    platformUserId = body?.senderId || body?.senderStaffId || "unknown";
  }

  if (!text.trim()) {
    return { reply: "🤖 你好！\n输入 /帮助 查看可用命令，/注册 创建新账号。" };
  }

  const appUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : process.env.APP_URL || "";

  // 验证码登录
  const codeLoginMatch = text
    .trim()
    .match(/(?:[!！\/]login\s+|^login\s+)(\d{6})\s*$/i);
  if (codeLoginMatch) {
    const code = codeLoginMatch[1];
    const chronosUserId = redeemAuthCode(code);
    if (!chronosUserId)
      return { reply: "❌ 验证码无效或已过期。请在网站设置页重新生成。" };
    bindBotUser(req.platform, platformUserId, chronosUserId);
    return {
      reply:
        "✅ 验证码绑定成功！\n\n你的机器人已关联 CHRONOS 账号。输入 /任务 开始管理项目。",
    };
  }

  // 查/建用户上下文
  const ctx = getOrCreateBotUser(req.platform, platformUserId);

  // 新用户欢迎消息（但注册/登录命令不应被拦截）
  const cmdClean = text
    .trim()
    .replace(/^[!！\/]\s*/, "")
    .trim();
  const isAuthCmd = /^(register|注册|signup|login|登录|signin)(?:\s|$)/i.test(
    cmdClean
  );
  if (ctx.isNew && !isAuthCmd) {
    return {
      reply:
        `👋 你好！你已自动获得 CHRONOS 临时账号。\n\n` +
        `📌 方式一：/注册 用户名 密码 → 创建正式账号\n` +
        `🔑 方式二：在 ${appUrl || "网站"}/settings 绑定 → 生成验证码 → 发 login <验证码>\n` +
        `🔍 方式三：/登录 用户名 密码 → 登录已有账号\n` +
        `\n输入 /帮助 查看全部命令。`,
    };
  }

  // 项目切换：/切换 #编号 或 /切换 <项目名>
  // P0: 切换前必须校验当前 bot 用户身份对目标 projectId 有访问权，
  //     否则攻击者可遍历 projectId 拖全库。
  const switchMatch = cmdClean.match(/^(切换|switch)\s+#?(\d+)$/i);
  const switchNameMatch = cmdClean.match(/^(切换|switch)\s+(.+)$/i);
  if (switchMatch) {
    const projectId = parseInt(switchMatch[2], 10);
    try {
      // 临时账号与无权项目在此统一被拒绝（口径不区分不存在/无权）
      await assertBotProjectAccess(ctx.chronosUserId, projectId);
    } catch (e) {
      if (e instanceof BotAccessDenied) return { reply: e.message };
      throw e;
    }
    const p = await db.getProjectById(projectId);
    if (!p)
      return {
        reply: `❌ 项目 #${projectId} 不存在或你没有访问权限。`,
      };
    updateBotContext(req.platform, platformUserId, {
      currentProjectId: projectId,
    });
    return {
      reply: `📁 已切换到「${p.name}」\n\n输入 /任务 查看此项目的待办任务，/报表 查看项目报表。`,
    };
  }
  if (switchNameMatch && !switchMatch) {
    // 按名切换同样过滤：只匹配当前用户有权访问的项目，无权项目名不泄露
    const allProjects = await db.getAllProjects();
    const candidates = allProjects.filter(p =>
      p.name.includes(switchNameMatch[2])
    );
    let target: (typeof candidates)[number] | undefined;
    for (const c of candidates) {
      try {
        await assertBotProjectAccess(ctx.chronosUserId, c.id);
        target = c;
        break;
      } catch (e) {
        if (!(e instanceof BotAccessDenied)) throw e;
        /* 无权项目 → 不可见，继续找下一个 */
      }
    }
    if (!target)
      return {
        reply: `❌ 找不到「${switchNameMatch[2]}」项目，或你没有访问权限。`,
      };
    updateBotContext(req.platform, platformUserId, {
      currentProjectId: target.id,
    });
    return {
      reply: `📁 已切换到「${target.name}」\n\n输入 /任务 查看此项目的待办任务，/报表 查看项目报表。`,
    };
  }

  // 执行命令
  const result = await executeCommand(
    text,
    ctx.chronosUserId,
    ctx.currentProjectId,
    appUrl
  );
  if (result.loggedInUserId) {
    bindBotUser(req.platform, platformUserId, result.loggedInUserId);
  }

  return { reply: result.reply };
}
