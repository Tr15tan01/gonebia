"use client";
import { useEffect, useState } from "react";

/** CaptureBox dispatches "timelymemo:refreshing-stats" with detail true/false
 *  around its router.refresh() call. This swaps a single stat's number for a
 *  small colorful spinner for exactly that window, so "this number is about
 *  to update" is visible instead of it just silently changing a moment
 *  later with no feedback - CaptureBox and the dashboard's stat cards live
 *  in different parts of the component tree (one client, one
 *  server-rendered), so a small custom event is the simplest bridge. */
export function AnimatedStatValue({ value, color }: { value: number | string; color: string }) {
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    function onRefresh(e: Event) {
      setRefreshing(!!(e as CustomEvent<boolean>).detail);
    }
    window.addEventListener("timelymemo:refreshing-stats", onRefresh);
    return () => window.removeEventListener("timelymemo:refreshing-stats", onRefresh);
  }, []);

  if (refreshing) {
    return (
      <span
        className="inline-block size-6 rounded-full stat-spinner"
        style={{ "--stat-spinner-color": color } as React.CSSProperties}
        aria-label="Updating"
        role="status"
      />
    );
  }
  return <>{value}</>;
}
