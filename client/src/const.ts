/**
 * startLogin — 跳转到本地登录页
 * httpOnly cookie 版本: 不再需要 OAuth 流程
 */
export const startLogin = () => {
  const current = window.location.pathname + window.location.search;
  window.location.href = `/login?redirect=${encodeURIComponent(current)}`;
};
