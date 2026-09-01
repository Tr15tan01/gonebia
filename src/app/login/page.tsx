"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { validatePassword, isBreached, PASSWORD_MIN, PASSWORD_MAX } from "@/lib/password";
import posthog from "posthog-js";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [signup, setSignup] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === "1";

  const busyLabel = signup ? "Creating your account"
    : mode === "password" ? "Signing you in" : "Sending magic link";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // password policy applies when a NEW password is chosen
    if (signup && mode === "password") {
      const structural = validatePassword(password);
      if (structural) { setError(structural); return; }
    }

    if (signup && !agree) { setError("The agreement checkbox must be checked to create an account."); return; }

    setBusy(true);
    const sb = createClient();
    try {
      if (mode === "password") {
        if (signup) {
          // k-anonymity breach check: hash prefix only, password never leaves the device
          const breached = await isBreached(password);
          if (breached) {
            setError("This password appears in known data breaches. Please choose a different one.");
            setBusy(false);
            return;
          }
          const { error } = await sb.auth.signUp({
            email, password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });
          if (error) throw error;
          posthog.capture("signed_up", { method: "password" });
          setSent(`Account created for ${email}. Check your inbox to confirm, then sign in.`);
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          posthog.identify(email, {});
          posthog.capture("signed_in", { method: "password" });
          window.location.href = "/dashboard";
        }
      } else {
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        posthog.capture("signed_up", { method: "magic_link" });
        setSent(`We sent a magic sign-in link to ${email}. First time? The link creates your account.`);
      }
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function google() {
    if (!agree) { setError("Please agree to the Terms and Privacy Policy first."); return; }
    const sb = createClient();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center flex flex-col items-center gap-2">
          <Link href="/" aria-label="Back to home" className="hover:opacity-80 transition-opacity cursor-pointer"><LogoMark size={48} /></Link>
          <div>
            <p className="font-display text-3xl">TimelyMemo</p>
            <p className="text-ink-2 text-sm mt-1">Remember things at the right time.</p>
          </div>
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
              <div>
                <input
                  className="input"
                  type="password"
                  required
                  placeholder={signup ? `Password (${PASSWORD_MIN}-${PASSWORD_MAX} characters)` : "Password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  autoComplete={signup ? "new-password" : "current-password"}
                />
                {signup && password.length > 0 && password.length < PASSWORD_MIN && (
                  <p className="text-xs mt-1" style={{ color: "var(--ember)" }}>
                    {PASSWORD_MIN - password.length} more character{PASSWORD_MIN - password.length === 1 ? "" : "s"}...
                  </p>
                )}
              </div>
            )}
            {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

            {signup && (
            <label className="flex items-start gap-2 text-xs text-ink-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                disabled={busy}
                className="size-4 mt-0.5 accent-[var(--ember)] shrink-0"
              />
              <span>
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-ember underline underline-offset-2">Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" target="_blank" className="text-ember underline underline-offset-2">Privacy Policy</Link>
                {" "}
                (including AI processing of submitted content as described there).
              </span>
            </label>
            )}

            <button type="submit" disabled={busy || (signup && !agree)} className="btn-primary w-full">
              {busy ? busyLabel + "..." : signup ? "Create account" : mode === "password" ? "Sign in" : "Send magic link"}
            </button>
            <div className="flex justify-between text-xs text-ink-2">
              <button type="button" disabled={busy} onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(null); }} className="cursor-pointer hover:text-ember">
                {mode === "password" ? "Use a magic link instead" : "Use email & password instead"}
              </button>
              {mode === "password" && (
                <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(null); }} className="cursor-pointer hover:text-ember">
                  {signup ? "Have an account? Sign in" : "New here? Create account"}
                </button>
              )}
            </div>
            {googleEnabled && (
              <>
                <div className="flex items-center gap-3 text-xs text-ink-2"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
                <button type="button" onClick={google} disabled={busy || (signup && !agree)} className="btn-ghost w-full">Continue with Google</button>
              </>
            )}
          </form>
        )}
        <p className="text-center text-xs text-ink-2">Remember. Connect. Notice.</p>
      </div>
    </div>
  );
}
