"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui";
import { UpgradeButton } from "@/components/upgrade-button";

/** Opens the Paddle customer portal. The tab is opened synchronously inside
 *  the click (then pointed at the portal once the URL arrives) - opening it
 *  after an await is what browsers silently block as a popup. */
export function ManageBillingButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true); setError(null);
    const tab = window.open("", "_blank");
    try { tab?.document.write("<p style='font-family:system-ui;padding:2rem'>Opening your billing portal…</p>"); } catch {}
    try {
      const res = await fetch("/api/billing/portal", { cache: "no-store" });
      const r = await res.json().catch(() => null);
      if (r?.url) {
        if (tab && !tab.closed) tab.location.href = r.url;
        else window.location.href = r.url;
      } else {
        tab?.close();
        setError(r?.error ?? "Couldn't open the billing portal.");
      }
    } catch {
      tab?.close();
      setError("Connection problem - please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-1.5">
      <button onClick={open} disabled={busy} className={`btn-ghost w-full ${className}`}>
        {busy ? "Opening portal…" : "💳 Manage billing · invoices, card, cancel"}
      </button>
      {error && <p className="text-xs" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
    </div>
  );
}

const TIERS = [
  { id: "premium" as const, name: "Premium", price: "$7.99/mo", color: "var(--premium)", blurb: "Your AI external brain" },
  { id: "pro" as const, name: "Pro", price: "$19.99/mo", color: "var(--pro)", blurb: "Agents working for you" },
];

function fmtMoney(minor: string | null, currency: string) {
  if (minor == null) return null;
  const n = Number(minor) / 100;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${n} ${currency}`; }
}

/** Switch between Premium and Pro. Paid users are moved on their existing
 *  subscription (prorated); free users go through checkout. */
export function ChangePlan({ plan }: { plan: string }) {
  const [target, setTarget] = useState<"premium" | "pro" | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const { update } = useSession();

  async function choose(t: "premium" | "pro") {
    setTarget(t); setPreview(null); setError(null); setLoading(true);
    try {
      const res = await fetch(`/api/billing/change-plan?to=${t}`, { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (d.checkout) {
        setTarget(null);
        window.dispatchEvent(new CustomEvent("timelymemo:checkout", { detail: { tier: t } }));
        return;
      }
      if (!res.ok) { setError(d.error ?? "Couldn't prepare the change."); return; }
      setPreview(d.preview);
    } finally { setLoading(false); }
  }

  async function confirmSwitch() {
    if (!target) return;
    setSwitching(true); setError(null);
    try {
      const res = await fetch("/api/billing/change-plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: target }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.checkout) { window.dispatchEvent(new CustomEvent("timelymemo:checkout", { detail: { tier: target } })); return; }
      if (!res.ok) { setError(d.error ?? "Couldn't change the plan."); return; }
      toast(`You're now on ${target === "pro" ? "Pro" : "Premium"}.`);
      setTarget(null);
      try { await update?.(); } catch {}
      router.refresh();
    } finally { setSwitching(false); }
  }

  if (plan === "free") {
    return (
      <div className="grid sm:grid-cols-2 gap-2">
        {TIERS.map((t) => (
          <div key={t.id} className="rounded-2xl border p-3 space-y-2" style={{ borderColor: `color-mix(in srgb, ${t.color} 35%, transparent)` }}>
            <p className="text-sm"><span className="font-semibold" style={{ color: t.color }}>{t.name}</span> · {t.price}</p>
            <p className="text-xs text-ink-2">{t.blurb}</p>
            <UpgradeButton tier={t.id} className="w-full !py-1.5 !text-xs" label={`Choose ${t.name}`} />
          </div>
        ))}
      </div>
    );
  }

  const tgt = TIERS.find((t) => t.id === target);
  return (
    <div className="space-y-2.5">
      <div className="grid sm:grid-cols-2 gap-2">
        {TIERS.map((t) => {
          const current = plan === t.id;
          return (
            <div key={t.id} className="rounded-2xl border p-3 space-y-2"
              style={{ borderColor: current ? t.color : "var(--line)", background: current ? `color-mix(in srgb, ${t.color} 8%, transparent)` : undefined }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm"><span className="font-semibold" style={{ color: t.color }}>{t.name}</span> · {t.price}</p>
                {current && <span className="chip !text-[10px] font-semibold" style={{ color: t.color }}>Current</span>}
              </div>
              <p className="text-xs text-ink-2">{t.blurb}</p>
              {!current && (
                <button onClick={() => choose(t.id)} disabled={loading || switching}
                  className="btn-tint w-full !py-1.5 !text-xs" style={{ "--tint": t.color } as React.CSSProperties}>
                  {loading && target === t.id ? "Checking price…" : t.id === "pro" ? "Upgrade to Pro" : "Switch to Premium"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {tgt && !loading && !error && (
        <div className="rounded-2xl p-3 text-sm space-y-2 phase-in" style={{ background: "var(--paper-2)" }}>
          <p className="font-semibold">Switch to {tgt.name}?</p>
          <p className="text-ink-2 text-xs leading-relaxed">
            {target === "pro"
              ? <>Pro starts right away. {preview?.dueNow != null ? <>You'll be charged <b>{fmtMoney(preview.dueNow, preview.currency)}</b> now for the rest of this billing period.</> : "The difference for the rest of this period is charged now."}</>
              : <>Premium applies right away; unused Pro time is credited to your next bill{preview?.nextAmount != null ? <> (next charge about <b>{fmtMoney(preview.nextAmount, preview.currency)}</b>)</> : null}.</>}
          </p>
          <div className="flex gap-2">
            <button onClick={confirmSwitch} disabled={switching} className="btn-primary !py-1.5 !text-xs">{switching ? "Switching…" : `Confirm ${tgt.name}`}</button>
            <button onClick={() => setTarget(null)} className="btn-ghost !py-1.5 !text-xs">Cancel</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs" style={{ color: "var(--danger)" }} role="alert">{error}</p>}
    </div>
  );
}
