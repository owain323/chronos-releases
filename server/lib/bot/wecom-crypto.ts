/**
 * 企业微信消息加解密
 * 参考：https://developer.work.weixin.qq.com/document/path/90968
 */
import crypto from "crypto";

const BLOCK_SIZE = 32;

/** 解密企微回调消息 */
export function decryptWecom(
  wecomToken: string,
  encodingAESKey: string,
  expectedSignature: string,
  expectedTimestamp: string,
  expectedNonce: string,
  encrypted: string
): string {
  const key = Buffer.from(encodingAESKey + "=", "base64");
  const iv = key.subarray(0, 16);

  // 1) 签名校验 — 公式：SHA1([token, timestamp, nonce, encrypt].sort().join(""))
  const items = [wecomToken, expectedTimestamp, expectedNonce, encrypted]
    .sort()
    .join("");
  const signature = crypto.createHash("sha1").update(items).digest("hex");
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
    throw new Error("签名校验失败（企微回调）");
  }

  // 2) AES-256-CBC 解密
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);

  // 3) 剥 PKCS#7 padding
  const pad = decrypted[decrypted.length - 1];
  decrypted = decrypted.subarray(0, decrypted.length - pad);

  // 4) 剥 16 字节随机前缀 → 4 字节 msgLen → content
  const content = decrypted.subarray(16);
  const msgLen = content.readUInt32BE(0);
  return content.subarray(4, 4 + msgLen).toString("utf8");
}

/** 加密回复消息 */
export function encryptWecom(
  wecomToken: string,
  encodingAESKey: string,
  reply: string,
  timestamp: string,
  nonce: string
): {
  encrypt: string;
  signature: string;
  timestamp: string;
  nonce: string;
  msg_signature: string;
} {
  const key = Buffer.from(encodingAESKey + "=", "base64");
  const iv = key.subarray(0, 16);

  // 拼装：16 字节随机 + 4 字节 msgLen + content
  const random16 = crypto.randomBytes(16);
  const content = Buffer.from(reply, "utf8");
  const msgLen = Buffer.alloc(4);
  msgLen.writeUInt32BE(content.length, 0);
  const raw = Buffer.concat([random16, msgLen, content]);

  // PKCS#7 padding 到 32 字节倍数
  const pad = BLOCK_SIZE - (raw.length % BLOCK_SIZE);
  const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  const encryptStr = encrypted.toString("base64");

  // 签名：SHA1([token, timestamp, nonce, encrypt].sort())
  const signature = crypto
    .createHash("sha1")
    .update([wecomToken, timestamp, nonce, encryptStr].sort().join(""))
    .digest("hex");

  return {
    encrypt: encryptStr,
    signature,
    timestamp,
    nonce,
    msg_signature: signature,
  };
}

/** 解析企微 XML 消息体（解密后） */
export function parseWecomXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  // 匹配叶子节点（不含子标签的）
  const regex =
    /<([A-Za-z][\w]*)>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/\1>(?!\s*<\w)/g;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    if (m[1] === "xml") continue;
    result[m[1]] = m[2] ?? m[3] ?? "";
  }
  // 回退方案：如果上面没匹配到（叶子节点结构），用宽松正则
  if (Object.keys(result).length === 0) {
    const fallback =
      /<([A-Za-z][\w]*)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*?))<\/\1>/g;
    while ((m = fallback.exec(xml)) !== null) {
      if (m[1] === "xml") continue;
      result[m[1]] = m[2] ?? m[3] ?? "";
    }
  }
  return result;
}

/** 构造企微 XML 回复 */
export function buildWecomReplyXml(
  fromUser: string,
  toUser: string,
  content: string
): string {
  return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`;
}

/** 构造企微 XML news 回复 */
export function buildWecomNewsXml(
  fromUser: string,
  toUser: string,
  articles: Array<{
    title: string;
    description?: string;
    url: string;
    picUrl?: string;
  }>
): string {
  const items = articles
    .map(
      a =>
        `<item>
      <Title><![CDATA[${a.title}]]></Title>
      <Description><![CDATA[${a.description || a.title}]]></Description>
      <PicUrl><![CDATA[${a.picUrl || ""}]]></PicUrl>
      <Url><![CDATA[${a.url}]]></Url>
    </item>`
    )
    .join("");
  return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
  <MsgType><![CDATA[news]]></MsgType>
  <ArticleCount>${articles.length}</ArticleCount>
  <Articles>${items}</Articles>
</xml>`;
}
