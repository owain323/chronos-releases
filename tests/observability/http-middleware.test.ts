// 可观测性 / 安全头集成测试 — 本地可跑（mini-app 临时端口，无需 live server）
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import {
  requestIdMiddleware,
  createSecurityHeadersMiddleware,
} from "../../server/lib/http-middlewares";

describe("http-middlewares (integration)", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(requestIdMiddleware);
    app.use(createSecurityHeadersMiddleware());
    app.get("/x", (_req, res) => res.json({ ok: true }));
    await new Promise<void>(resolve => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(() => {
    server?.close();
  });

  it("echoes incoming x-request-id", async () => {
    const res = await fetch(`${base}/x`, {
      headers: { "x-request-id": "test-rid-1" },
    });
    expect(res.headers.get("x-request-id")).toBe("test-rid-1");
  });

  it("generates x-request-id when not provided", async () => {
    const res = await fetch(`${base}/x`);
    const rid = res.headers.get("x-request-id");
    expect(rid).toBeTruthy();
    expect(rid!.length).toBeGreaterThan(0);
  });

  it("sets security headers (CSP / referrer-policy / COOP / Permissions-Policy)", async () => {
    const res = await fetch(`${base}/x`);
    expect(res.headers.get("content-security-policy")).toBeTruthy();
    expect(res.headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(res.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(res.headers.get("permissions-policy")).toContain("geolocation=()");
  });
});
