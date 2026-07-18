import { useState, useEffect } from "react";
import { trpc } from "../../lib/trpc";

// Feature Flag Hook — L2 功能开关（客户端）
// 用法: const showNewUI = useFeatureFlag("newDashboard");
//        if (showNewUI) return <NewDashboard />;

let cachedFlags: string[] = [];
let cacheUserId: number | undefined;

export function useFeatureFlag(flagKey: string): boolean {
  const [enabled, setEnabled] = useState(() => cachedFlags.includes(flagKey));
  const { data: user } = trpc.auth.me.useQuery();

  useEffect(() => {
    const userId = user?.id;
    // 如果缓存有效（同用户），直接用缓存
    if (userId === cacheUserId && cachedFlags.length > 0) {
      setEnabled(cachedFlags.includes(flagKey));
      return;
    }

    // 从服务端获取
    fetch(`/api/feature-flags?userId=${userId ?? ""}`)
      .then(r => r.json())
      .then((flags: string[]) => {
        cachedFlags = flags;
        cacheUserId = userId;
        setEnabled(flags.includes(flagKey));
      })
      .catch(() => {
        // 网络失败时降级为 false
        setEnabled(false);
      });
  }, [flagKey, user?.id]);

  return enabled;
}
