"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders server components every `intervalMs` (default 5 min) so relative
 *  times ("in 30 min", "2h ago") stay accurate. Only fires while the tab is
 *  visible; client state (open sheets, chat drafts) is preserved. */
export function AutoRefresh({ intervalMs = 5 * 60 * 1000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
