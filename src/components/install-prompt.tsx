"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Show the banner at most once every SHOW_EVERY_MS (24h => once a day, max).
 *  The timestamp is written when the banner is SHOWN, so ignoring it still
 *  counts - no more banner on every refresh. */
const SHOW_EVERY_MS = 24 * 60 * 60 * 1000;

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (standalone) return;

    let lastShown = 0;
    try { lastShown = +(localStorage.getItem("gonebia-install-last") ?? 0); } catch {}
    if (Date.now() - lastShown < SHOW_EVERY_MS) return;

    const markShown = () => {
      try { localStorage.setItem("gonebia-install-last", String(Date.now())); } catch {}
    };

    const onBIP = (e: Event) => {
      e.preventDefault();
      markShown();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIOS) {
      timer = setTimeout(() => { markShown(); setIos(true); setVisible(true); }, 4000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try { localStorage.setItem("gonebia-install-last", String(Date.now())); } catch {}
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-6 z-40 px-4 flex justify-center pointer-events-none">
      <div className="card p-4 shadow-xl max-w-md w-full flex items-center gap-3 pointer-events-auto rise">
        <img src="/icon.svg" alt="" className="size-10 rounded-xl shrink-0" />
        {ios ? (
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
          {!ios && <button onClick={install} className="btn-primary !py-1.5 !text-xs">Install</button>}
          <button onClick={dismiss} className="btn-ghost !py-1.5 !text-xs">Not now</button>
        </div>
      </div>
    </div>
  );
}
