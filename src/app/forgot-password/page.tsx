"use client";
import { useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error ?? "Something went wrong - please try again."); return; }
      setMessage(body.message ?? "If an account exists for that email, a reset link is on its way.");
    } catch {
      setError("Something went wrong - please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center flex flex-col items-center gap-2">
          <Link href="/" aria-label="Back to home" className="hover:opacity-80 transition-opacity cursor-pointer"><LogoMark size={48} /></Link>
          <div>
            <p className="font-display text-3xl">Reset your password</p>
            <p className="text-ink-2 text-sm mt-1">We'll email you a link to set a new one.</p>
          </div>
        </div>

        {message ? (
          <div className="card p-5 text-sm">
            <p>{message}</p>
            <Link href="/login" className="text-ember hover:underline text-sm mt-4 inline-block">Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-5 space-y-3">
            <input
              className="input" type="email" required placeholder="Email"
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} autoComplete="email"
            />
            {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
            <button type="submit" disabled={busy || !email.trim()} className="btn-primary w-full">
              {busy ? "Sending..." : "Send reset link"}
            </button>
            <div className="flex justify-center text-xs text-ink-2">
              <Link href="/login" className="cursor-pointer hover:text-ember">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
