/**
 * CHRONOS 统一配置中心
 * 所有环境变量集中校验，缺失直接 crash（避免运行中途报错）
 */
const required = (key: string): string => {
  const v = process.env[key];
  if (!v) {
    console.error(`❌ Missing env: ${key}`);
    process.exit(1);
  }
  return v;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] || fallback;

export const config = {
  server: {
    port: parseInt(optional("PORT", "3000")),
    env: optional("NODE_ENV", "development"),
  },
  auth: {
    jwtSecret: required("JWT_SECRET"),
    tokenExpiry: optional("TOKEN_EXPIRY", "7d"),
    bcryptRounds: 12,
  },
  db: {
    type: optional("DB_TYPE", "sqlite") as "sqlite" | "postgres",
    url: optional("DATABASE_URL", ""),
    poolMax: parseInt(optional("DB_POOL_MAX", "20")),
  },
  redis: {
    url: optional("REDIS_URL", ""),
  },
  rateLimit: {
    maxFails: parseInt(optional("RATE_LIMIT_MAX", "10")),
    windowSec: parseInt(optional("RATE_LIMIT_WINDOW", "900")),
  },
  audit: {
    retentionDays: parseInt(optional("AUDIT_RETENTION_DAYS", "180")),
  },
  backup: {
    dir: optional("BACKUP_DIR", "/opt/CHRONOS/backups"),
    retentionDays: parseInt(optional("BACKUP_RETENTION_DAYS", "30")),
  },
};
