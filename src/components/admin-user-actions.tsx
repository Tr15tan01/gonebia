"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserActionButtons({ userId, disabled, aiPaused }: { userId: string; disabled: boolean; aiPaused: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  async function act(action: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body?.error ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {disabled ? (
        <button onClick={() => act("enable_account")} disabled={!!busy} className="btn-ghost !text-sm">
          {busy === "enable_account" ? "..." : "Re-enable account"}
        </button>
      ) : (
        <button
          onClick={() => act("disable_account", "Disable this account? They will be signed out and unable to log in until re-enabled.")}
          disabled={!!busy} className="btn-ghost !text-sm" style={{ color: "var(--danger)" }}
        >
          {busy === "disable_account" ? "..." : "Disable account"}
        </button>
      )}
      {aiPaused ? (
        <button onClick={() => act("resume_ai")} disabled={!!busy} className="btn-ghost !text-sm">
          {busy === "resume_ai" ? "..." : "Resume AI features"}
        </button>
      ) : (
        <button
          onClick={() => act("pause_ai", "Pause AI/agent features for this account? They can still use the app but capture, chat, discover, and agents will be disabled.")}
          disabled={!!busy} className="btn-ghost !text-sm" style={{ color: "var(--ember)" }}
        >
          {busy === "pause_ai" ? "..." : "Pause AI features"}
        </button>
      )}
    </div>
  );
}
