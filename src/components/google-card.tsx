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
          className="btn-ghost !py-1.5 !text-xs"
        >Disconnect</button>
      ) : (
        <a href="/api/google/connect" className="btn-ghost !py-1.5 !text-xs w-fit">Connect Google</a>
      )}
      <p className="text-xs text-ink-2">
        Tokens are stored server-side only, encrypted in transit, and never shown in the app.
        Note: while the app is in Google's "testing" mode, only approved test users can connect.
      </p>
    </section>
  );
}
