"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DAY = 86_400_000;

/** Install banner. Android/desktop Chrome: beforeinstallprompt with a real
 *  Install button. iOS Safari: an "Add to Home Screen" hint.
 *  Frequency: at most once per day - "Not now" (or dismissing the native
 *  prompt) silences it for 24h, then it may appear once more. */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (standalone) return; // already installed

    let lastShown = 0;
    try { lastShown = +(localStorage.getItem("gonebia-install-last") ?? 0); } catch {}
    if (Date.now() - lastShown < DAY) return; // refused/seen recently - stay quiet today

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setVisible(true);
    };
    const onInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIOS) {
      timer = setTimeout(() => { setIos(true); setVisible(true); }, 4000);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  function quietForToday() {
    try { localStorage.setItem("gonebia-install-last", String(Date.now())); } catch {}
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    quietForToday(); // whether accepted or dismissed, don't nag again today
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 md:bottom-6 z-40 px-4 flex justify-center pointer-events-none">
      <div className="card p-4 shadow-xl max-w-md w-full flex items-center gap-3 pointer-events-auto rise">
        <img src="/icon.svg" alt="" className="size-10 rounded-xl shrink-0" />
        {ios ? (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install Gonebia</p>
            <p className="text-xs text-ink-2 mt-0.5">
              Tap the Share <span aria-hidden>⎋</span> button, then "Add to Home Screen".
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Install Gonebia as an app</p>
            <p className="text-xs text-ink-2 mt-0.5">Full screen, offline-ready, one tap from your home screen.</p>
          </div>
        )}
        <div className="flex flex-col gap-1.5 shrink-0">
          {!ios && <button onClick={install} className="btn-primary !py-1.5 !text-xs">Install</button>}
          <button onClick={quietForToday} className="btn-ghost !py-1.5 !text-xs">Not now</button>
        </div>
      </div>
    </div>
  );
}
