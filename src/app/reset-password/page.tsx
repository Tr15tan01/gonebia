"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { validatePassword, isBreached, PASSWORD_MIN, PASSWORD_MAX } from "@/lib/password";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) { setError("This reset link is missing its token - please use the link from your email."); return; }
    const structural = validatePassword(password);
    if (structural) { setError(structural); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }

    setBusy(true);
    try {
      const breached = await isBreached(password);
      if (breached) {
        setError("This password appears in known data breaches. Please choose a different one.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.error ?? "Couldn't reset your password - please try again."); setBusy(false); return; }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Something went wrong - please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center flex flex-col items-center gap-2">
          <Link href="/" aria-label="Back to home" className="hover:opacity-80 transition-opacity cursor-pointer"><LogoMark size={48} /></Link>
          <div>
            <p className="font-display text-3xl">Set a new password</p>
          </div>
        </div>

        {done ? (
          <div className="card p-5 text-sm">
            <p>Your password has been reset. Taking you to sign in...</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-5 space-y-3">
            <div>
              <input
                className="input" type="password" required
                placeholder={`New password (${PASSWORD_MIN}-${PASSWORD_MAX} characters)`}
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} autoComplete="new-password"
              />
              {password.length > 0 && password.length < PASSWORD_MIN && (
                <p className="text-xs mt-1" style={{ color: "var(--ember)" }}>
                  {PASSWORD_MIN - password.length} more character{PASSWORD_MIN - password.length === 1 ? "" : "s"}...
                </p>
              )}
            </div>
            <div>
              <input
                className="input" type="password" required placeholder="Confirm new password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={busy} autoComplete="new-password"
              />
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="text-xs mt-1" style={{ color: "var(--ember)" }}>Passwords don't match yet.</p>
              )}
            </div>
            {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
            <button type="submit" disabled={busy || !password || password !== confirmPassword} className="btn-primary w-full">
              {busy ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
