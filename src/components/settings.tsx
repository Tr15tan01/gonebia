"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/theme";
import { useToast } from "@/components/ui";

type PermState = "unsupported" | "granted" | "denied" | "default" | "loading";

export function SettingsClient({ email, prefs, timezone }: { email: string; prefs: any; timezone: string }) {
  const { theme, apply } = useTheme();
  const [qs, setQs] = useState(prefs?.quiet_hours_start ?? 22);
  const [qe, setQe] = useState(prefs?.quiet_hours_end ?? 8);
  const [pushOn, setPushOn] = useState(!!prefs?.push_enabled);
  const [sens, setSens] = useState(prefs?.insight_sensitivity ?? 0.75);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [perm, setPerm] = useState<PermState>("loading");
  const [appOn, setAppOn] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function readState() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported"); setAppOn(false); return;
    }
    const p = Notification.permission as PermState;
    setPerm(p);
    setAppOn(p === "granted" && localStorage.getItem("gonebia-fg-notifs") !== "0");
  }
  useEffect(() => { readState(); }, []);

  async function save(patch: object, msg: string) {
    const res = await fetch("/api/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    toast(res.ok ? msg : "Couldn't save that - please try again.");
    router.refresh();
  }


  async function toggleInApp() {
    if (perm === "unsupported") { toast("This browser doesn't support notifications (on iPhone, install the app first)."); return; }
    if (perm === "denied") {
      toast("Notifications are BLOCKED for this site - see the steps below the switch.");
      return;
    }
    if (appOn) {
      localStorage.setItem("gonebia-fg-notifs", "0");
      setAppOn(false);
      toast("In-app alerts off.");
      return;
    }
    let p = Notification.permission;
    if (p !== "granted") p = await Notification.requestPermission();
    await readState();
    if (p === "granted") {
      localStorage.removeItem("gonebia-fg-notifs");
      setAppOn(true);
      toast("In-app alerts on.");
      try { new Notification("TimelyMemo", { body: "Alerts are on.", icon: "/icon.svg" }); } catch {}
    } else {
      toast("The browser blocked notifications - see the steps below.");
    }
  }

  function testNotification() {
    if (perm !== "granted") { toast("Enable alerts first."); return; }
    try {
      new Notification("TimelyMemo", { body: "This is a test - if you see this, alerts work.", icon: "/icon.svg" });
      toast("Sent - check your system notifications.");
    } catch { toast("Couldn't show a notification."); }
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
      const p = await Notification.requestPermission();
      if (p !== "granted") return;
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

  const permLabel: Record<PermState, string> = {
    loading: "checking...",
    unsupported: "not supported in this browser",
    granted: "allowed",
    denied: "BLOCKED by the browser",
    default: "not asked yet",
  };
  const permColor: Record<PermState, string> = {
    loading: "var(--ink-2)", unsupported: "var(--ink-2)",
    granted: "var(--success)", denied: "var(--danger)", default: "var(--ink-2)",
  };

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

        <div className="flex items-center justify-between text-sm">
          <span>Browser permission</span>
          <span className="text-xs font-medium" style={{ color: permColor[perm] }}>{permLabel[perm]}</span>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Alert me while the app is open
            <span className="block text-xs text-ink-2 mt-0.5">
              Turn off right here - instant, no browser settings needed.
            </span>
          </span>
          <input
            type="checkbox"
            checked={appOn}
            disabled={perm === "unsupported" || perm === "denied" || perm === "loading"}
            onChange={toggleInApp}
            className="size-4 accent-[var(--ember)] shrink-0"
          />
        </label>

        {perm === "denied" && (
          <div className="rounded-xl p-3 text-xs" style={{ background: "var(--danger-soft)", border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)" }}>
            <p className="font-medium" style={{ color: "var(--danger)" }}>Notifications are blocked for this site.</p>
            <ol className="list-decimal list-inside mt-1.5 space-y-0.5 text-ink-2">
              <li>Click the lock/tune icon <span aria-hidden>🔒</span> left of the address bar</li>
              <li>Find <b>Notifications</b> and set it to <b>Allow</b></li>
              <li>Reload this page</li>
            </ol>
            <p className="mt-1.5 text-ink-2">
              (If you dismissed the prompt twice earlier, the browser blocks it silently - only the steps above can undo that.)
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={testNotification} disabled={perm !== "granted"} className="btn-ghost !py-1.5 !text-xs">
            Send test notification
          </button>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Web push (background)
            <span className="block text-xs text-ink-2 mt-0.5">
              Even when the app is closed. Needs VAPID keys; on iPhone, install the app first.
            </span>
          </span>
          <input type="checkbox" checked={pushOn} onChange={togglePush} className="size-4 accent-[var(--ember)] shrink-0" />
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
