"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/components/logo";

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState("error"); setError("This link is missing its token - please use the link from your email."); return; }
    (async () => {
      try {
        const res = await fetch("/api/verify-email/confirm", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { setState("error"); setError(body?.error ?? "Couldn't verify your email."); return; }
        setState("ok");
      } catch {
        setState("error"); setError("Something went wrong - please try again.");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center flex flex-col items-center gap-2">
          <Link href="/" aria-label="Back to home" className="hover:opacity-80 transition-opacity cursor-pointer"><LogoMark size={48} /></Link>
          <p className="font-display text-3xl">Verify your email</p>
        </div>

        <div className="card p-5 text-sm text-center">
          {state === "checking" && <p>Verifying...</p>}
          {state === "ok" && (
            <>
              <p>Your email is verified. You're all set.</p>
              <Link href="/login" className="btn-primary w-full mt-4 inline-block">Sign in</Link>
            </>
          )}
          {state === "error" && (
            <>
              <p style={{ color: "var(--danger)" }}>{error}</p>
              <Link href="/login" className="text-ember hover:underline text-sm mt-4 inline-block">Back to sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
