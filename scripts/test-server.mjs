// 极简回显测试
import http from "node:http";
import crypto from "node:crypto";

const WECOM_TOKEN = process.env.WECOM_TOKEN || "";
const WECOM_AES_KEY = process.env.WECOM_AES_KEY || "";

http
  .createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log("Query:", req.url);

    if (req.method === "GET" && req.url?.includes("/api/bot/callback")) {
      const url = new URL(req.url, "http://localhost");
      const msgSignature = url.searchParams.get("msg_signature");
      const timestamp = url.searchParams.get("timestamp");
      const nonce = url.searchParams.get("nonce");
      const echostr = url.searchParams.get("echostr");

      console.log("msg_signature:", msgSignature);
      console.log("timestamp:", timestamp);
      console.log("nonce:", nonce);
      console.log("echostr:", echostr);

      const aesKey = Buffer.from(WECOM_AES_KEY + "=", "base64");
      const iv = aesKey.subarray(0, 16);
      try {
        const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
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
        console.log("Decrypted echostr:", msg);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(msg);
      } catch (e) {
        console.log("Decrypt error:", e.message);
        res.writeHead(403);
        res.end("error: " + e.message);
      }
    } else {
      res.writeHead(200);
      res.end("ok");
    }
  })
  .listen(3500, () => console.log("Test server on :3500"));
