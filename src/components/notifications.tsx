"use client";
import { useEffect } from "react";

/** System notifications while the app is open (desktop + mobile).
 *  Requires browser permission AND the in-app switch
 *  (Settings -> "Alert me while the app is open") to be on. */
export function ForegroundNotifier() {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (localStorage.getItem("gonebia-fg-notifs") === "0") return;

    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem("gonebia-seen-notifs") ?? "[]"); } catch {}
    const seenSet = new Set(seen);

    async function poll() {
      try {
        const r = await fetch("/api/notifications");
        if (!r.ok) return;
        const d = await r.json();
        let changed = false;
        for (const n of d.notifications ?? []) {
          if (seenSet.has(n.id)) continue;
          seenSet.add(n.id);
          changed = true;
          try {
            new Notification(`Gonebia - ${n.title}`, { body: n.body, icon: "/icon.svg", tag: n.id });
          } catch {}
        }
        if (changed) {
          localStorage.setItem("gonebia-seen-notifs", JSON.stringify([...seenSet].slice(-200)));
        }
      } catch {}
    }

    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, []);
  return null;
}
