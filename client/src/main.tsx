import { trpc, trpcClientOptions } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import App from "./App";
import { toast } from "sonner";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown): boolean => {
  if (!(error instanceof TRPCClientError)) return false;
  if (typeof window === "undefined") return false;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return false;

  startLogin();
  return true;
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    if (redirectToLoginIfUnauthorized(error)) return;
    // v4.0: 非 401 错误 toast 呈现，不再静默丢弃
    const msg = (error as any)?.message || String(error).slice(0, 200);
    if (msg) toast.error(msg);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    if (redirectToLoginIfUnauthorized(error)) return;
    const msg = (error as any)?.message || String(error).slice(0, 200);
    if (msg) toast.error(msg);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient(trpcClientOptions);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
