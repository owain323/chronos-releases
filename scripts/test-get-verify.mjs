// 生成 params + 本地测试 GET 验证
import crypto from "node:crypto";
import http from "node:http";

const TOKEN = process.env.WECOM_TOKEN || "";
const KEY = process.env.WECOM_AES_KEY || "";
const TS = String(Math.floor(Date.now() / 1000));
const NONCE = "testnonce2";
const ECHOSTR = "echotestYES..!!";

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

const path = `/api/bot/callback?msg_signature=${sig}&timestamp=${TS}&nonce=${NONCE}&echostr=${encodeURIComponent(encrypted)}`;

http.get(`http://localhost:3006${path}`, res => {
  let body = "";
  res.on("data", c => (body += c));
  res.on("end", () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${body}`);
    console.log(`Expected: ${ECHOSTR}`);
    console.log(body === ECHOSTR ? "✅ PASS" : "❌ FAIL");
  });
});
