"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_LIFETIME_MS = 2200; // how long a toast stays fully visible
const TOAST_EXIT_MS = 180; // fade-out duration before it's removed - keep in sync with .toast-out below

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; leaving: boolean }[]>([]);

  const remove = useCallback((id: number) => {
    // start the exit animation first, then drop it from the list once it's done
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_EXIT_MS);
  }, []);

  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, leaving: false }]);
    setTimeout(() => remove(id), TOAST_LIFETIME_MS);
  }, [remove]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center px-4">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => remove(t.id)}
            className={`card px-4 py-2.5 text-sm shadow-lg cursor-pointer ${t.leaving ? "toast-out" : "rise"}`}
          >
            {t.msg}
          </button>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Empty state ---------- */
export function Empty({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="card p-8 text-center">
      <div className="text-3xl mb-3">{icon}</div>
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-ink-2 mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number } = {}) {
  return (
    <span
      className="inline-block border-2 border-ink-2/30 border-t-ember rounded-full animate-spin shrink-0"
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  );
}

/* ---------- Big beautiful loader ---------- */
export function Loader({ label, sub }: { label?: string; sub?: string }) {
  return (
    <div className="flex items-center justify-center gap-4 py-2" role="status" aria-live="polite">
      <div className="loader-ring" />
      <div>
        {label && <p className="font-medium text-sm">{label}<span className="loader-dots"><span /><span /><span /></span></p>}
        {sub && <p className="text-xs text-ink-2 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ---------- Bottom sheet (mobile) / centered dialog (desktop) ---------- */
export function Sheet({ open, onClose, children, accent }: {
  open: boolean; onClose: () => void; children: React.ReactNode; accent?: string;
}) {
  // Escape closes; the page behind stops scrolling while it's open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true">
      <div className="sheet-backdrop absolute inset-0" onClick={onClose} />
      <div className="sheet-panel relative w-full md:max-w-xl max-h-[88vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-5 md:p-6"
        style={{ "--sheet-accent": accent ?? "var(--ember)" } as React.CSSProperties}>
        <div className="md:hidden mx-auto -mt-2 mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        <button onClick={onClose} aria-label="Close"
          className="absolute right-4 top-4 grid place-items-center size-8 rounded-full text-ink-2 hover:text-ink hover:bg-paper-2 transition-colors cursor-pointer">✕</button>
        {children}
      </div>
    </div>
  );
}

/** Small floating spinner shown while a sheet's content is fetched, so the
 *  sheet itself only appears once there's something to show. */
export function SheetLoading({ onCancel }: { onCancel?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center" role="status" aria-live="polite" aria-label="Loading">
      <div className="sheet-backdrop sheet-backdrop-light absolute inset-0" onClick={onCancel} />
      <div className="relative card soft-shadow rounded-2xl px-5 py-4 flex items-center gap-3 pop-in">
        <span className="inline-block size-5 rounded-full border-2 border-ink-2/25 border-t-ember animate-spin" />
        <span className="text-sm font-medium">Opening memory…</span>
      </div>
    </div>
  );
}

/** An image that shows a small spinner until it has loaded, then fades in.
 *  If it fails, `fallback` is shown instead (nothing, by default). */
export function SmartImage({ src, alt = "", className = "", fallback = null }: {
  src: string; alt?: string; className?: string; fallback?: React.ReactNode;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const ref = useRef<HTMLImageElement>(null);
  // an image already in the browser cache can finish before React hydrates
  // and attaches onLoad - check it directly so the spinner never sticks
  useEffect(() => {
    setState("loading");
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "ready" : "error");
  }, [src]);
  if (state === "error") return <>{fallback}</>;
  return (
    <span className={`relative inline-block overflow-hidden bg-paper-2 ${className}`}>
      {state === "loading" && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="inline-block size-4 rounded-full border-2 border-ink-2/25 border-t-ember animate-spin" />
        </span>
      )}
      <img
        ref={ref}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={() => setState("ready")}
        onError={() => setState("error")}
        className="size-full object-cover transition-opacity duration-500"
        style={{ opacity: state === "ready" ? 1 : 0 }}
      />
    </span>
  );
}
