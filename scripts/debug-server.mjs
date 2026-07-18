/**
 * 极简回调监听器——把所有收到的 HTTP 请求全部打日志
 */
import http from "node:http";
import crypto from "node:crypto";

const PORT = 3007;
const LOG_FILE = "/opt/CHRONOS/bot-debug.log";

const WECOM_TOKEN = process.env.WECOM_TOKEN || "7iTGgQyg2ADq4WN0bsOhkVv3I";
const WECOM_AES_KEY =
  process.env.WECOM_AES_KEY || "bhgJrsmSiPcEJQAOpPU4RVmBQFDmUq7KoyQMecG26uS";

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  require("fs").appendFileSync(LOG_FILE, line + "\n");
}

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      log(`=== ${req.method} ${req.url} ===`);
      log(`Headers: ${JSON.stringify(req.headers)}`);
      log(`Body: ${body.substring(0, 2000)}`);

      // GET 验证
      if (req.method === "GET") {
        const url = new URL(req.url || "/", "http://localhost");
        const sig = url.searchParams.get("msg_signature");
        const ts = url.searchParams.get("timestamp");
        const nonce = url.searchParams.get("nonce");
        const echostr = url.searchParams.get("echostr");
        if (sig && echostr && WECOM_AES_KEY) {
          try {
            const key = Buffer.from(WECOM_AES_KEY + "=", "base64");
            const decipher = crypto.createDecipheriv(
              "aes-256-cbc",
              key.subarray(0, 16),
              key.subarray(0, 16)
            );
            decipher.setAutoPadding(false);
            let decrypted = Buffer.concat([
              decipher.update(Buffer.from(echostr, "base64")),
              decipher.final(),
            ]);
            const pad = decrypted[decrypted.length - 1];
            decrypted = decrypted.subarray(0, decrypted.length - pad);
            const content = decrypted.subarray(16);
            const msgLen = content.readUInt32BE(0);
            const msg = content.subarray(4, 4 + msgLen).toString("utf8");
            log(`✅ GET 验证通过，echostr=${msg}，签名校验=跳过`);
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(msg);
          } catch (e) {
            log(`❌ GET 验证失败: ${e.message}`);
            res.writeHead(403);
            res.end("fail");
          }
          return;
        }
      }

      // 所有其他请求：返回 200 + 打印 body
      log(`-> 返回 200 OK`);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("logged ok");
    });
  })
  .listen(PORT, () => {
    log(`Debug server listening on :${PORT}`);
    log(
      `Token=${WECOM_TOKEN.substring(0, 6)}... AES=${WECOM_AES_KEY.substring(0, 6)}...`
    );
  });
