import { describe, it, expect } from "vitest";
import { z } from "zod";

// 直接测试 env schema 逻辑（绕过缓存）
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL 不能为空"),
  VITE_APP_TITLE: z.string().default("CHRONOS"),
  JWT_SECRET: z.string().optional().default(""),
});

describe("environment schema validation", () => {
  it("throws when DATABASE_URL is empty", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "" });
    expect(result.success).toBe(false);
  });

  it("throws when DATABASE_URL is missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("succeeds with valid DATABASE_URL", () => {
    const result = envSchema.safeParse({ DATABASE_URL: "file:./chronos.db" });
    expect(result.success).toBe(true);
  });

  it("defaults NODE_ENV to development", () => {
    const result = envSchema.parse({ DATABASE_URL: "file:./chronos.db" });
    expect(result.NODE_ENV).toBe("development");
  });

  it("defaults PORT to 3000", () => {
    const result = envSchema.parse({ DATABASE_URL: "file:./chronos.db" });
    expect(result.PORT).toBe(3000);
  });

  it("parses PORT as number from string", () => {
    const result = envSchema.parse({
      DATABASE_URL: "file:./chronos.db",
      PORT: "8080",
    });
    expect(result.PORT).toBe(8080);
  });

  it("NODE_ENV rejects invalid values", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "db",
      NODE_ENV: "invalid",
    });
    expect(result.success).toBe(false);
  });
});
