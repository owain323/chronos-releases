# ADR-005: JWT + Cookie 认证方案

**日期**: 2026-07-11
**状态**: 已采纳
**决策者**: 曹子杰

## 背景

CHRONOS 需要安全的用户认证方案。选项包括 Session-based、JWT-based、OAuth 等。

## 选项

1. **Session-based** — 传统方案，服务端存储 session
2. **JWT (Bearer token)** — 无状态，但 token 暴露在 JS 中有 XSS 风险
3. **JWT + HttpOnly Cookie** — 结合 JWT 的无状态和 Cookie 的安全性

## 决策

**选择 JWT + HttpOnly Secure SameSite Strict Cookie。**

关键设计：
- JWT 存储在 `HttpOnly; Secure; SameSite=Strict` Cookie 中
- JS 无法读取 token → 彻底防御 XSS token 窃取
- 使用 `jose` 库（而不是 `jsonwebtoken`）做 JWT 签名/验证
- token 有效期 7 天，支持 `tokenVersion` 全局吊销
- CSRF 通过 `SameSite=Strict` + `X-CSRF-Token` header 双重防护

## 后果

### 正面
- XSS 无法窃取 token（HttpOnly）
- 无状态，不需要 Redis/内存存储 session
- `tokenVersion` 支持紧急全局登出

### 负面
- Cookie 跨域受限（SameSite），微服务架构需额外处理
- JWT 无法主动吊销（需 tokenVersion 间接实现）
- 移动端/非浏览器客户端需要额外适配
