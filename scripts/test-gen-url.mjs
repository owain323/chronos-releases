// 生成企微 GET 验证参数并测试
import crypto from "node:crypto";

const TOKEN = process.env.WECOM_TOKEN || "";
const KEY = process.env.WECOM_AES_KEY || "";
const TS = String(Math.floor(Date.now() / 1000));
const NONCE = "testnonce";
const ECHOSTR = "echotestok123";

const aesKey = Buffer.from(KEY + "=", "base64");
const iv = aesKey.subarray(0, 16);
const random16 = crypto.randomBytes(16);
const buf = Buffer.from(ECHOSTR, "utf8");
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(buf.length, 0);
const raw = Buffer.concat([random16, lenBuf, buf]);
const pad = 32 - (raw.length % 32);
const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);
const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
cipher.setAutoPadding(false);
const encrypted = Buffer.concat([
  cipher.update(padded),
  cipher.final(),
]).toString("base64");

const sig = crypto
  .createHash("sha1")
  .update([TOKEN, TS, NONCE, encrypted].sort().join(""))
  .digest("hex");

console.log(
  `URL: /api/bot/callback?msg_signature=${sig}&timestamp=${TS}&nonce=${NONCE}&echostr=${encrypted}`
);
console.log(`EXPECTED: ${ECHOSTR}`);
