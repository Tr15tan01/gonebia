"use client";
import { createContext, useCallback, useContext, useState } from "react";

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center px-4">
        {toasts.map((t) => (
          <div key={t.id} className="rise card px-4 py-2.5 text-sm shadow-lg">{t.msg}</div>
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

export function Spinner() {
  return <span className="inline-block size-4 border-2 border-ink-2/30 border-t-ember rounded-full animate-spin" aria-label="Loading" />;
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
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative card w-full md:max-w-xl max-h-[85vh] overflow-y-auto rounded-b-none md:rounded-2xl p-5 rise">
        <button onClick={onClose} className="absolute right-4 top-4 text-ink-2 hover:text-ink" aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}
