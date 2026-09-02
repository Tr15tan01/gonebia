"use client";
import { useEffect, useRef, useState } from "react";

/** A small, unobtrusive connection-status pill - not a full-width banner.
 *  Goes red and stays up the whole time you're offline (so it's never
 *  ambiguous), then flips to green for a couple seconds when the connection
 *  comes back and fades itself out. Nothing to click, nothing to dismiss. */
export function NetworkStatus() {
  // "hidden" until we actually detect an offline event, so a page that loads
  // fine never shows a flash of anything.
  const [state, setState] = useState<"hidden" | "offline" | "back" | "leaving">("hidden");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // starting truly offline (e.g. opened the PWA with no signal) should show immediately
    if (typeof navigator !== "undefined" && navigator.onLine === false) setState("offline");

    function clearTimers() { timers.current.forEach(clearTimeout); timers.current = []; }

    function goOffline() {
      clearTimers();
      setState("offline");
    }
    function goOnline() {
      clearTimers();
      setState("back");
      // show solid green for ~2s, fade for ~200ms, then unmount
      timers.current.push(setTimeout(() => setState("leaving"), 2000));
      timers.current.push(setTimeout(() => setState("hidden"), 2200));
    }

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      clearTimers();
    };
  }, []);

  if (state === "hidden") return null;

  const offline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-3 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium shadow-lg ${state === "leaving" ? "toast-out" : "rise"}`}
      style={{ background: offline ? "var(--danger)" : "var(--success)", color: "white" }}
    >
      <span className="inline-block size-1.5 rounded-full bg-white/90" />
      {offline ? "You're offline - changes will sync once you're back" : "Back online"}
    </div>
  );
}
