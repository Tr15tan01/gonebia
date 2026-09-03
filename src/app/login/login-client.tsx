"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { Loader } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { validatePassword, isBreached, PASSWORD_MIN, PASSWORD_MAX } from "@/lib/password";
import posthog from "posthog-js";

// NOTE: magic-link (passwordless email) sign-in relied on Supabase Auth's
// built-in transactional email sending and hasn't been rebuilt - email +
// password and Google remain. The Google Calendar/Gmail integration is a
// separate feature elsewhere in the app and is unaffected by this page.
// Whether Google sign-in is available is now decided server-side (see
// page.tsx) from whether GOOGLE_CLIENT_ID/SECRET are actually configured -
// no separate NEXT_PUBLIC_ flag to remember to keep in sync with them.

// Client-side-only lockout UI: NOT a real security boundary (anyone calling
// the API directly bypasses this trivially) - it exists purely so a real
// person gets clear, immediate feedback instead of silently failing forever.
// The actual enforcement lives server-side in src/lib/auth.ts's authorize().
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60_000;
const ATTEMPTS_KEY = "timelymemo-login-attempts";

function loadAttempts(email: string): { count: number; until: number } {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) ?? "{}");
    const rec = raw[email.trim().toLowerCase()];
    if (!rec || rec.until < Date.now()) return { count: 0, until: 0 };
    return rec;
  } catch { return { count: 0, until: 0 }; }
}
function recordFailure(email: string) {
  try {
    const key = email.trim().toLowerCase();
    const raw = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) ?? "{}");
    const prev = raw[key]?.until > Date.now() ? raw[key] : { count: 0, until: 0 };
    const count = prev.count + 1;
    raw[key] = { count, until: count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 };
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(raw));
  } catch {}
}
function clearAttempts(email: string) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ATTEMPTS_KEY) ?? "{}");
    delete raw[email.trim().toLowerCase()];
    sessionStorage.setItem(ATTEMPTS_KEY, JSON.stringify(raw));
  } catch {}
}

export function LoginClient({ googleEnabled }: { googleEnabled: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(0);
  const router = useRouter();

  // re-check lockout state as the user types their email, and tick a clock
  // so the "try again in Xm" message counts down instead of sitting static
  useEffect(() => {
    if (!email) { setLockedUntil(0); return; }
    setLockedUntil(loadAttempts(email).until);
  }, [email]);
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const locked = lockedUntil > Date.now();
  const minsLeft = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
  const busyLabel = signup ? "Creating your account" : "Signing you in";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (loadAttempts(email).until > Date.now()) {
      setError(`Too many attempts. Please try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}.`);
      return;
    }

    if (signup && !name.trim()) { setError("Please enter your name."); return; }

    if (signup) {
      const structural = validatePassword(password);
      if (structural) { setError(structural); return; }
      if (password !== confirmPassword) { setError("Passwords don't match."); return; }
      if (!agree) { setError("The agreement checkbox must be checked to create an account."); return; }
    }

    setBusy(true);
    try {
      if (signup) {
        // k-anonymity breach check: hash prefix only, password never leaves the device
        const breached = await isBreached(password);
        if (breached) {
          setError("This password appears in known data breaches. Please choose a different one.");
          setBusy(false);
          return;
        }
        const res = await fetch("/api/register", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email, password }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 429) { setLockedUntil(Date.now() + LOCKOUT_MS); setError(body?.error ?? "Too many attempts - please try again later."); }
          else setError(body?.error ?? "Couldn't create your account.");
          setBusy(false);
          return;
        }
        posthog.capture("signed_up", { method: "password" });
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        recordFailure(email);
        const attempts = loadAttempts(email);
        setLockedUntil(attempts.until);
        setError(
          attempts.until > Date.now()
            ? `Too many attempts. Please try again in ${Math.ceil((attempts.until - Date.now()) / 60_000)} minutes.`
            : signup ? "Account created, but sign-in failed - please try signing in below." : "Incorrect email or password."
        );
        setBusy(false);
        return;
      }
      clearAttempts(email);
      posthog.identify(email, {});
      posthog.capture(signup ? "signed_up_and_in" : "signed_in", { method: "password" });
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong - please try again.");
      setBusy(false);
    }
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

        <div className="card p-5 space-y-3 relative overflow-hidden">
          {busy && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-card/85 backdrop-blur-sm">
              <Loader label={busyLabel} sub="This only takes a moment." />
            </div>
          )}

          {googleEnabled && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="btn-ghost w-full flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.5 29 4.5 24 4.5c-7.6 0-14.1 4.3-17.4 10.6z"/><path fill="#4CAF50" d="M24 43.5c4.9 0 9.4-1.9 12.8-5l-6-4.9c-2 1.4-4.5 2.2-6.9 2.2-5.3 0-9.8-3.1-11.4-7.7l-6.6 5.1C9.8 39.1 16.4 43.5 24 43.5z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6 4.9C40.1 36.6 43.5 30.8 43.5 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-3 text-xs text-ink-2">
                <div className="h-px bg-line flex-1" /><span>or</span><div className="h-px bg-line flex-1" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3">
            {signup && (
              <input className="input" type="text" required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="name" />
            )}
            <input className="input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} autoComplete="email" />
            <div className="space-y-3">
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
              {signup && (
                <div>
                  <input
                    className="input"
                    type="password"
                    required
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={busy}
                    autoComplete="new-password"
                  />
                  {confirmPassword.length > 0 && confirmPassword !== password && (
                    <p className="text-xs mt-1" style={{ color: "var(--ember)" }}>Passwords don't match yet.</p>
                  )}
                </div>
              )}
            </div>
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

            <button
              type="submit"
              disabled={busy || locked || (signup && !agree) || (signup && !!confirmPassword && password !== confirmPassword)}
              className="btn-primary w-full"
            >
              {locked ? `Try again in ${minsLeft}m` : busy ? busyLabel + "..." : signup ? "Create account" : "Sign in"}
            </button>
            <div className="flex justify-center text-xs text-ink-2">
              <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(null); }} className="cursor-pointer hover:text-ember">
                {signup ? "Have an account? Sign in" : "New here? Create account"}
              </button>
            </div>
            {!signup && (
              <div className="flex justify-center text-xs">
                <Link href="/forgot-password" className="text-ink-2 hover:text-ember cursor-pointer">Forgot password?</Link>
              </div>
            )}
          </form>
        </div>
        <p className="text-center text-xs text-ink-2">Remember. Connect. Notice.</p>
      </div>
    </div>
  );
}
