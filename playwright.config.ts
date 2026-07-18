import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.TEST_URL || "http://localhost:3006",
    headless: true,
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: "node dist/index.js",
        port: 3006,
        reuseExistingServer: true,
        env: {
          JWT_SECRET: "test-jwt-secret-for-e2e-at-least-32-characters",
          DATABASE_URL: "file:./chronos.db",
          NODE_ENV: "test",
        },
      },
});
