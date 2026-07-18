import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export const setToken = (_t: string) => {}; // v4.0: no-op, auth via httpOnly cookie only
export const clearToken = () => {};

export const trpcClientOptions = {
  links: [
    httpLink({
      url: "/api/trpc",
      headers() {
        const h: Record<string, string> = {};
        try {
          const wid = localStorage.getItem("currentWorkspaceId");
          if (wid) h["x-workspace-id"] = wid;
        } catch {}
        return h;
      },
      fetch(url, options) {
        return fetch(url, options).then(async res => {
          // 429 不抛给 tRPC, 客户端走 retry
          if (res.status === 429) {
            throw new Error("服务器限流，请稍后重试");
          }
          return res;
        });
      },
    }),
  ],
};
