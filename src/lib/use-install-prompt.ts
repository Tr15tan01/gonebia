"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let capturedEvent: BIPEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    capturedEvent = e as BIPEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    capturedEvent = null;
    notify();
  });
}

export type InstallResult = "installed" | "dismissed" | "unavailable" | "error";

/** Any component that wants an "Install" button uses this hook - it's a
 *  module-level singleton because `beforeinstallprompt` only ever fires ONCE
 *  per page load, so if the floating banner and a Settings button each tried
 *  to listen independently, whichever mounted second would simply never see
 *  the event (it already fired and was consumed). */
export function useInstallPrompt() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true
  );

  async function install(): Promise<InstallResult> {
    if (!capturedEvent) return "unavailable";
    try {
      await capturedEvent.prompt();
      const choice = await capturedEvent.userChoice;
      capturedEvent = null;
      notify();
      return choice.outcome === "accepted" ? "installed" : "dismissed";
    } catch (e) {
      // Most commonly happens when the screen locked (or the tab was
      // backgrounded) between capturing this event and calling it - Android
      // Chrome can silently invalidate the deferred prompt in that window,
      // and there's no way to "retry" the same event once that happens.
      // Previously this threw uncaught, so the Install button just did
      // nothing with no feedback - now it's reported so the UI can fall
      // back to manual instructions instead of looking broken.
      console.error("[install-prompt] prompt() failed - event was likely invalidated:", e);
      capturedEvent = null;
      notify();
      return "error";
    }
  }

  return { canInstall: !!capturedEvent && !standalone, isIOS, standalone, installed, install };
}
