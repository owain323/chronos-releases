import React from "react";
import { trpc } from "@/lib/trpc";

export function SystemGuard({ children }: { children: React.ReactNode }) {
  const { data: me } = trpc.auth.me.useQuery();
  const systemRole = (me as any)?.systemRole;

  if (
    !systemRole ||
    (systemRole !== "SYSTEM_OWNER" && systemRole !== "SYSTEM_AUDITOR")
  ) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">403</h1>
          <p className="text-muted-foreground">System access required</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
