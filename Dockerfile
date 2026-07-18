# ============================================
# CHRONOS Docker 部署
# 阶段 1: 构建前端 + 后端
# 阶段 2: 最小运行时
# ============================================

FROM node:22-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npx vite build --outDir dist/public
RUN npx esbuild server/_core/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir=dist

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# 仅安装生产依赖（drizzle-kit 等 devDependency 不进运行时镜像）
RUN npm ci --legacy-peer-deps --ignore-scripts --omit=dev
COPY --from=builder /build/dist ./dist
COPY scripts/init-db.mjs ./scripts/init-db.mjs
COPY scripts/backup-db.mjs ./scripts/backup-db.mjs
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./drizzle.config.ts
RUN chmod +x scripts/docker-entrypoint.sh
RUN mkdir -p /app/uploads /app/backup /app/data && chown -R node:node /app
VOLUME ["/app/data"]
USER node
# 修复: 显式声明生产环境与端口。缺省 PORT=3000 与 HEALTHCHECK 的 3006
# 不一致，裸 docker run（无 compose environment）必然 unhealthy。
ENV NODE_ENV=production \
    PORT=3006
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/api/health',r=>{process.exit(r.statusCode===200?0:1)})"
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
