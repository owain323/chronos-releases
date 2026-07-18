/**
 * E2E Smoke Tests — 核心用户旅程
 * 覆盖: 注册→登录→Dashboard→健康检查
 */
import { test, expect } from "@playwright/test";

test.describe("Smoke", () => {
  test("health endpoint returns 200", async ({ request }) => {
    const resp = await request.get("/api/health");
    expect(resp.ok()).toBeTruthy();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=登录")).toBeVisible({ timeout: 10000 });
  });

  test("registration works", async ({ request }) => {
    const email = `e2e-smoke-${Date.now()}@test.dev`;
    const resp = await request.post("/api/trpc/auth.register", {
      data: { name: "E2E测试", email, password: "Abcd1234!@test" },
    });
    expect(resp.ok()).toBeTruthy();
  });

  test("login then access dashboard", async ({ request }) => {
    const email = `e2e-login-${Date.now()}@test.dev`;
    // Register
    await request.post("/api/trpc/auth.register", {
      data: { name: "LoginTest", email, password: "Abcd1234!@test" },
    });
    // Login
    const loginResp = await request.post("/api/trpc/auth.login", {
      data: { email, password: "Abcd1234!@test" },
    });
    expect(loginResp.ok()).toBeTruthy();
    const body = await loginResp.json();
    const token = body?.result?.data?.json?.token || body?.result?.data?.token;
    expect(token).toBeTruthy();

    // Access dashboard with token
    const dashResp = await request.get("/api/trpc/dashboard.stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dashResp.ok()).toBeTruthy();
  });
});
