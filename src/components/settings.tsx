"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme";
import { useToast } from "@/components/ui";

export function SettingsClient({ email, prefs, timezone }: { email: string; prefs: any; timezone: string }) {
  const { theme, apply } = useTheme();
  const [qs, setQs] = useState(prefs?.quiet_hours_start ?? 22);
  const [qe, setQe] = useState(prefs?.quiet_hours_end ?? 8);
  const [pushOn, setPushOn] = useState(!!prefs?.push_enabled);
  const [sens, setSens] = useState(prefs?.insight_sensitivity ?? 0.75);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function save(patch: object, msg: string) {
    const res = await fetch("/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    toast(res.ok ? msg : "Couldn't save that - please try again.");
    router.refresh();
  }

  async function togglePush() {
    if (pushOn) {
      await fetch("/api/push/subscribe", { method: "DELETE" });
      setPushOn(false); toast("Push notifications off.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast("Push isn't supported in this browser."); return;
    }
    const { publicKey } = await fetch("/api/push/vapid").then((r) => r.json());
    if (!publicKey) { toast("Push isn't configured on the server yet (set VAPID keys)."); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      });
      await fetch("/api/push/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()),
      });
      setPushOn(true); toast("Push notifications on.");
    } catch { toast("Couldn't enable push."); }
  }

  async function deleteAccount() {
    const ok = await fetch("/api/account", { method: "DELETE" });
    if (ok.ok) { window.location.href = "/"; } else toast("Deletion failed - please try again.");
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl">Settings</h1>

      <section className="card p-5 space-y-3">
        <p className="label">Appearance</p>
        <div className="flex gap-2">
          {["light", "dark", "system"].map((t) => (
            <button key={t} onClick={() => { apply(t); save({ theme: t }, "Theme saved."); }}
              className={`btn-ghost !py-1.5 !text-xs ${theme === t ? "!border-ember !text-ember" : ""}`}>{t}</button>
          ))}
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <p className="label">Notifications</p>
        <label className="flex items-center justify-between text-sm">
          <span>Web push notifications</span>
          <input type="checkbox" checked={pushOn} onChange={togglePush} className="size-4 accent-[var(--ember)]" />
        </label>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Quiet from
            <select className="input mt-1" value={qs} onChange={(e) => { const v = +e.target.value; setQs(v); save({ quiet_hours_start: v }, "Quiet hours saved."); }}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
          </label>
          <label>Until
            <select className="input mt-1" value={qe} onChange={(e) => { const v = +e.target.value; setQe(v); save({ quiet_hours_end: v }, "Quiet hours saved."); }}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-ink-2">During quiet hours reminders are postponed, never dropped.</p>
      </section>

      <section className="card p-5 space-y-3">
        <p className="label">Insight sensitivity</p>
        <input type="range" min="0.5" max="0.95" step="0.05" value={sens}
          onChange={(e) => setSens(+e.target.value)}
          className="w-full accent-[var(--ember)]"
          aria-label="Insight sensitivity"
        />
        <p className="text-xs text-ink-2">
          {sens >= 0.85 ? "Calm - only high-confidence insights." : sens >= 0.7 ? "Balanced." : "Curious - more observations."}
        </p>
        <button onClick={() => save({ insight_sensitivity: sens }, "Sensitivity saved.")} className="btn-ghost !py-1.5 !text-xs">
          Save sensitivity
        </button>
      </section>

      <section className="card p-5 space-y-3">
        <p className="label">Timezone</p>
        <p className="text-sm">
          Detected: {Intl.DateTimeFormat().resolvedOptions().timeZone}
          {timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && <span className="text-ink-2"> (stored: {timezone})</span>}
        </p>
        <button onClick={() => save({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, "Timezone updated.")} className="btn-ghost !py-1.5 !text-xs">
          Use detected timezone
        </button>
        <p className="text-xs text-ink-2">All natural-language dates are resolved in your timezone.</p>
      </section>

      <section className="card p-5 space-y-3">
        <p className="label">Your data - {email}</p>
        <p className="text-sm text-ink-2">Your memories are never used to train AI models. Only you can access them.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/account" className="btn-ghost !py-1.5 !text-xs">Download all my data (JSON)</a>
          <button onClick={() => setConfirmDelete(true)} className="btn-ghost !py-1.5 !text-xs !text-red-600 dark:!text-red-400">Delete account & all data</button>
        </div>
        {confirmDelete && (
          <div className="rounded-xl border border-red-500/40 p-3 text-sm space-y-2">
            <p>This permanently deletes your account and every memory, insight, and notification. There is no undo.</p>
            <div className="flex gap-2">
              <button onClick={deleteAccount} className="btn-primary !py-1.5 !text-xs !bg-red-600">Yes, delete everything</button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost !py-1.5 !text-xs">Cancel</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
