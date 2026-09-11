"use client";
import { signOut } from "next-auth/react";
import { useState } from "react";

export default function AccountDisabledPage() {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try { await signOut({ redirect: false }); } catch {}
    window.location.href = "/";
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="card p-8 max-w-md text-center space-y-4">
        <h1 className="font-display text-2xl">Account disabled</h1>
        <p className="text-ink-2 text-sm leading-relaxed">
          This account has been disabled. If you believe this is a mistake, please contact support.
        </p>
        <button onClick={logout} disabled={loggingOut} className="btn-ghost">
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}
