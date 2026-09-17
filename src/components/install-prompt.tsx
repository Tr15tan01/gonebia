"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui";
import { useInstallPrompt } from "@/lib/use-install-prompt";

/** Show the banner at most once every SHOW_EVERY_MS (24h => once a day, max).
 *  The timestamp is written when the banner is SHOWN, so ignoring it still
 *  counts - no more banner on every refresh. */
const SHOW_EVERY_MS = 24 * 60 * 60 * 1000;

export function InstallPrompt() {
  const { canInstall, isIOS, standalone, install } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (standalone) return;
    let lastShown = 0;
    try { lastShown = +(localStorage.getItem("timelymemo-install-last") ?? 0); } catch {}
    if (Date.now() - lastShown < SHOW_EVERY_MS) return;

    const markShown = () => { try { localStorage.setItem("timelymemo-install-last", String(Date.now())); } catch {} };

    // Reacts to canInstall/isIOS changing (the hook re-renders this
    // component the moment `beforeinstallprompt` fires, however long after
    // mount that happens - no polling needed).
    if (canInstall) { markShown(); setVisible(true); }
    else if (isIOS) {
      const t = setTimeout(() => { markShown(); setVisible(true); }, 4000);
      return () => clearTimeout(t);
    }
  }, [canInstall, isIOS, standalone]);

  function dismiss() {
    try { localStorage.setItem("timelymemo-install-last", String(Date.now())); } catch {}
    setVisible(false);
  }

  async function handleInstall() {
    const result = await install();
    if (result === "installed" || result === "dismissed") { dismiss(); return; }
    if (result === "error") {
      toast("Couldn't open the install prompt - try again, or use your browser menu's \"Install app\" / \"Add to Home Screen\" option.");
      return;
    }
    // "unavailable" - the captured event is gone (already used, or this
    // browser never offered one). Manual fallback is the only path left.
    toast("Use your browser menu's \"Install app\" or \"Add to Home Screen\" option.");
  }

  if (!visible || standalone) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-6 z-40 px-4 flex justify-center pointer-events-none">
      <div className="card p-4 shadow-xl max-w-md w-full flex items-center gap-3 pointer-events-auto rise">
        <img src="/icon.svg" alt="" className="size-10 rounded-xl shrink-0" />
        {isIOS ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install TimelyMemo</p>
            <p className="text-xs text-ink-2 mt-0.5">
              Tap the Share <span aria-hidden>⎋</span> button, then "Add to Home Screen".
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install TimelyMemo as an app</p>
            <p className="text-xs text-ink-2 mt-0.5">Full screen, offline-ready, one tap from your home screen.</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5 shrink-0">
          {!isIOS && <button onClick={handleInstall} className="btn-primary !py-1.5 !text-xs">Install</button>}
          <button onClick={dismiss} className="btn-ghost !py-1.5 !text-xs">Not now</button>
        </div>
      </div>
    </div>
  );
}
