import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  decryptWecom,
  encryptWecom,
  parseWecomXml,
  buildWecomReplyXml,
} from "./wecom-crypto";

const TEST_TOKEN = "mytoken123";
const TEST_KEY = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"; // 43 chars
const TS = String(Math.floor(Date.now() / 1000));
const NONCE = "testnonce";

/** 企微签名公式：SHA1([token, timestamp, nonce, encrypt].sort()) */
function sha1(items: string[]) {
  return crypto.createHash("sha1").update(items.sort().join("")).digest("hex");
}

function makeEncrypted(content: string) {
  const key = Buffer.from(TEST_KEY + "=", "base64");
  const iv = key.subarray(0, 16);
  const random16 = crypto.randomBytes(16);
  const buf = Buffer.from(content, "utf8");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(buf.length, 0);
  const raw = Buffer.concat([random16, lenBuf, buf]);
  const pad = 32 - (raw.length % 32);
  const padded = Buffer.concat([raw, Buffer.alloc(pad, pad)]);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString(
    "base64"
  );
}

describe("wecom-crypto", () => {
  it("decrypts a valid message", () => {
    const content = "你好，机器人";
    const enc = makeEncrypted(content);
    const sig = sha1([TEST_TOKEN, TS, NONCE, enc]);
    const dec = decryptWecom(TEST_TOKEN, TEST_KEY, sig, TS, NONCE, enc);
    expect(dec).toBe(content);
  });

  it("rejects wrong signature", () => {
    const enc = makeEncrypted("hello");
    expect(() =>
      decryptWecom(TEST_TOKEN, TEST_KEY, "wrong-sig", TS, NONCE, enc)
    ).toThrow(/签名/);
  });

  it("rejects signature made without token", () => {
    const content = "no-token";
    const enc = makeEncrypted(content);
    // 错误签名：没加 token
    const badSig = sha1([TS, NONCE, enc]);
    expect(() =>
      decryptWecom(TEST_TOKEN, TEST_KEY, badSig, TS, NONCE, enc)
    ).toThrow(/签名/);
  });

  it("encrypts and verifies signature consistency", () => {
    const reply = "回复内容";
    const result = encryptWecom(TEST_TOKEN, TEST_KEY, reply, TS, NONCE);
    expect(result.encrypt).toBeTruthy();
    // 加密后的签名必须包含 token
    expect(result.signature).toBe(
      sha1([TEST_TOKEN, TS, NONCE, result.encrypt])
    );
  });

  it("parses XML message", () => {
    const xml = `<xml><ToUserName><![CDATA[corp]]></ToUserName><FromUserName><![CDATA[user]]></FromUserName><Content><![CDATA[/任务]]></Content></xml>`;
    const parsed = parseWecomXml(xml);
    expect(parsed.ToUserName).toBe("corp");
    expect(parsed.FromUserName).toBe("user");
    expect(parsed.Content).toBe("/任务");
  });

  it("builds reply XML", () => {
    const xml = buildWecomReplyXml("corp", "user", "OK");
    expect(xml).toContain("corp");
    expect(xml).toContain("user");
    expect(xml).toContain("OK");
  });

  it("decrypts echostr for GET verification", () => {
    const content = "randomEchostr123";
    const enc = makeEncrypted(content);
    const sig = sha1([TEST_TOKEN, TS, NONCE, enc]);
    const dec = decryptWecom(TEST_TOKEN, TEST_KEY, sig, TS, NONCE, enc);
    expect(dec).toBe(content);
  });
});
