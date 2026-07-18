import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";

export function useHeartbeat() {
  const lastApiRef = useRef(Date.now());
  const hb = trpc.system.heartbeat.useMutation();

  const trackApiCall = () => {
    lastApiRef.current = Date.now();
  };

  useEffect(() => {
    const onApiCall = () => {
      lastApiRef.current = Date.now();
    };
    window.addEventListener("api-call", onApiCall);
    return () => window.removeEventListener("api-call", onApiCall);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastApiRef.current > 60_000) {
        try {
          hb.mutate({ timestamp: Date.now() });
        } catch {}
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [hb]);

  return { trackApiCall };
}
