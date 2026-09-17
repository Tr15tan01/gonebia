"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui";

export function GoogleCard() {
  const [state, setState] = useState<{ configured: boolean; connected: boolean; email: string | null } | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/google/status").then((r) => r.json()).then(setState).catch(() => setState(null));
  }, []);

  if (state === null) return null;

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="label">Google integrations</p>
        {state.connected && (
          <span className="chip" style={{ color: "var(--success)", borderColor: "color-mix(in srgb, var(--success) 40%, transparent)" }}>
            connected{state.email ? ` - ${state.email}` : ""}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-2">
        Connect Google Calendar (read + create events) and Gmail (<b>read-only</b> - we can never send, delete or modify mail).
        Your agents can then use appointments and emails as context when solving problems.
      </p>
      {!state.configured ? (
        <p className="text-xs text-ink-2">
          Google sign-in isn't configured on the server yet (needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).
        </p>
      ) : state.connected ? (
        <button
          onClick={async () => {
            await fetch("/api/google/status", { method: "DELETE" });
            setState({ ...state, connected: false, email: null });
            toast("Google disconnected - tokens deleted and revoked.");
          }}
          className="btn-tint !py-1.5 !text-xs w-fit"
          style={{ "--tint": "var(--danger)" } as React.CSSProperties}
        >Disconnect</button>
      ) : (
        <a href="/api/google/connect" className="btn-tint w-fit" style={{ "--tint": "var(--c-task)" } as React.CSSProperties}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden><path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.95S8.78 6.28 12 6.28c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.72 14.53 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12s4.12 9.2 9.2 9.2c5.31 0 8.83-3.73 8.83-8.99 0-.6-.07-1.06-.15-1.51z"/></svg>
          Connect Google
        </a>
      )}
      <p className="text-xs text-ink-2">
        Tokens are stored server-side only, encrypted in transit, and never shown in the app.
        Note: while the app is in Google's "testing" mode, only approved test users can connect.
      </p>
    </section>
  );
}
