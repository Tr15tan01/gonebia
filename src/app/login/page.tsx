"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [signup, setSignup] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "1";

  const busyLabel = signup ? "Creating your account"
    : mode === "password" ? "Signing you in" : "Sending magic link";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const sb = createClient();
    try {
      if (mode === "password") {
        if (signup) {
          const { error } = await sb.auth.signUp({
            email, password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
          if (error) throw error;
          setSent(`Account created for ${email}. Check your inbox to confirm, then sign in.`);
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          window.location.href = "/dashboard";
        }
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setSent(`We sent a magic sign-in link to ${email}. First time? The link creates your account.`);
      }
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function google() {
    const sb = createClient();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="font-display text-3xl">Gonebia</p>
          <p className="text-ink-2 text-sm mt-1">Your external memory.</p>
        </div>

        {sent ? (
          <div className="card p-5 text-center text-sm">
            <p className="font-medium">Check your inbox</p>
            <p className="text-ink-2 mt-1">{sent}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card p-5 space-y-3 relative overflow-hidden">
            {busy && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-card/85 backdrop-blur-sm">
                <Loader label={busyLabel} sub="This only takes a moment." />
              </div>
            )}
            <input className="input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
            {mode === "password" && (
              <input className="input" type="password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
            )}
            {error && <p className="text-sm text-danger" style={{ color: "var(--danger)" }}>{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? busyLabel + "..." : signup ? "Create account" : mode === "password" ? "Sign in" : "Send magic link"}
            </button>
            <div className="flex justify-between text-xs text-ink-2">
              <button type="button" disabled={busy} onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(null); }} className="hover:text-ember">
                {mode === "password" ? "Use a magic link instead" : "Use email & password instead"}
              </button>
              {mode === "password" && (
                <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(null); }} className="hover:text-ember">
                  {signup ? "Have an account? Sign in" : "New here? Create account"}
                </button>
              )}
            </div>
            {googleEnabled && (
              <>
                <div className="flex items-center gap-3 text-xs text-ink-2"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
                <button type="button" onClick={google} disabled={busy} className="btn-ghost w-full">Continue with Google</button>
              </>
            )}
          </form>
        )}
        <p className="text-center text-xs text-ink-2">Remember. Connect. Notice.</p>
      </div>
    </div>
  );
}
