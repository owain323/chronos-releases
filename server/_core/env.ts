import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL 不能为空（例：file:./chronos.db）"),
    VITE_APP_TITLE: z.string().default("CHRONOS"),
    // JWT_SECRET: 生产/开发必须显式 ≥32字符 · 测试可用默认
    JWT_SECRET: z.string().transform((val, ctx) => {
      const env = process.env.NODE_ENV || "development";
      if (env === "test" && !val)
        return "test-jwt-secret-at-least-32-chars-long!";
      if (!val || val.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `JWT_SECRET 必须 ≥ 32 字符 (当前: ${val?.length || 0})`,
        });
        return z.NEVER;
      }
      if (val === "chronos-dev-jwt-do-not-use-in-production-!!replace-me!!") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_SECRET 不能使用默认值，请在 .env 中设置真实的随机密钥",
        });
        return z.NEVER;
      }
      return val;
    }),
    OAUTH_SERVER_URL: z.string().optional().default(""),
    OWNER_OPEN_ID: z.string().optional().default(""),
    APP_URL: z.string().optional().default(""),
    USE_SQL_AGGREGATION: z.enum(["true", "false"]).optional().default("true"),
    VITE_APP_ID: z.string().optional().default(""),
    BUILT_IN_FORGE_API_URL: z.string().optional().default(""),
    BUILT_IN_FORGE_API_KEY: z.string().optional().default(""),
    // AI/LLM (OpenAI 兼容, 可选)
    OPENAI_API_KEY: z.string().optional().default(""),
    OPENAI_BASE_URL: z.string().optional().default("https://api.openai.com/v1"),
    AI_MODEL: z.string().optional().default("gpt-4o-mini"),
    _UNUSED: z.any().optional(),
  })
  .passthrough();

export type EnvConfig = z.infer<typeof envSchema>;

let cached: EnvConfig | null = null;

export function validateEnv(): EnvConfig {
  if (cached) return cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `❌ 环境变量校验失败，服务启动中止：\n${issues}\n请检查 .env 文件并确保必填项已配置。`
    );
  }

  cached = result.data;
  return cached;
}

export const ENV = {
  get appId() {
    return validateEnv().VITE_APP_ID;
  },
  get cookieSecret() {
    return validateEnv().JWT_SECRET;
  },
  get databaseUrl() {
    return validateEnv().DATABASE_URL;
  },
  get oAuthServerUrl() {
    return validateEnv().OAUTH_SERVER_URL;
  },
  get ownerOpenId() {
    return validateEnv().OWNER_OPEN_ID;
  },
  get isProduction() {
    return validateEnv().NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return validateEnv().BUILT_IN_FORGE_API_URL;
  },
  get forgeApiKey() {
    return validateEnv().BUILT_IN_FORGE_API_KEY;
  },
};
