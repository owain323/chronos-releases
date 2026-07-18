// Request 上下文 — V3.8 可观测性
// 用 AsyncLocalStorage 在请求生命周期内传递 requestId，
// 让任何一处日志都能自动带上 requestId 实现链路关联。
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestCtx {
  requestId: string;
}

const requestStore = new AsyncLocalStorage<RequestCtx>();

/** 在请求生命周期内运行 fn，期间 getRequestId() 可取到 requestId */
export function runWithRequest<T>(ctx: RequestCtx, fn: () => T): T {
  return requestStore.run(ctx, fn);
}

/** 取当前请求的 requestId；非请求上下文返回 undefined */
export function getRequestId(): string | undefined {
  return requestStore.getStore()?.requestId;
}

/** 扩展的 Express Request 类型，携带 requestId */
export interface RequestWithRequestId {
  requestId?: string;
}
