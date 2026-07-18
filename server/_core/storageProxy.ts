import type { Express } from "express";
import { verifyToken } from "../routers/auth";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  // v4.4 WO-SEC-6: 代理层仅验 JWT+有效 token, 文件级授权委托 forge 后端。
  // forge 根据 key 做自有 ACL 校验 (workspace/项目/用户级), 不依赖此代理的鉴权。
  app.get("/manus-storage/*", async (req, res) => {
    // Auth: JWT via header or cookie
    const auth = req.headers.authorization || "";
    const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const queryToken = (req.query.token as string) || "";
    const cookieToken = (req.cookies?.token as string) || "";
    const token = headerToken || queryToken || cookieToken;
    if (!token || !verifyToken(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(
          `[StorageProxy] forge error: ${forgeResp.status} ${body}`
        );
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
