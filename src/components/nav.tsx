"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { Logo, LogoMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { relTime } from "@/lib/dates";

const LINKS = [
  { href: "/dashboard", label: "Today", icon: "◍" },
  { href: "/tasks", label: "Tasks", icon: "☑" },
  { href: "/timeline", label: "Timeline", icon: "≡" },
  { href: "/chat", label: "Ask my memory", icon: "◎" },
  { href: "/insights", label: "Insights", icon: "◈" },
  { href: "/books", label: "Books", icon: "▤" },
  { href: "/people", label: "People", icon: "☏" },
  { href: "/graph", label: "Graph", icon: "⁂" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function AppNav({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/notifications");
        const d = await r.json();
        if (alive) setNotifs(d.notifications ?? []);
      } catch {}
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [notifOpen]);

  async function act(id: string, action: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    setNotifs((n) => n.filter((x) => x.id !== id));
  }

  async function logout() {
    setLoggingOut(true);
    try { await createClient().auth.signOut(); } catch {}
    window.location.href = "/";
  }

  return (
    <div className="min-h-dvh flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-line p-4 gap-1 sticky top-0 h-dvh">
        <Link href="/dashboard" className="px-3 py-4 inline-flex" aria-label="TimelyMemo home"><Logo /></Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${path.startsWith(l.href) ? "bg-ember-soft text-ember font-medium" : "text-ink-2 hover:text-ink hover:bg-paper-2"}`}>
            <span aria-hidden>{l.icon}</span>{l.label}
          </Link>
        ))}
        <div className="mt-auto flex items-center justify-between px-3 pt-3 border-t border-line">
          <button onClick={() => setNotifOpen(true)} className="btn-ghost !px-2.5 relative" aria-label="Notifications">
            🔔
            {notifs.length > 0 && <span className="absolute -top-1 -right-1 size-4 rounded-full bg-ember text-white text-[10px] grid place-items-center">{notifs.length}</span>}
          </button>
          <button onClick={logout} disabled={loggingOut} className="btn-ghost !px-2.5" aria-label="Log out" title="Log out">⇥</button>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-line bg-paper/90 backdrop-blur">
          <Link href="/dashboard" className="inline-flex items-center gap-2" aria-label="TimelyMemo home"><LogoMark size={24} /><span className="font-display text-lg">TimelyMemo</span></Link>
          <div className="flex items-center gap-2">
            <button onClick={logout} disabled={loggingOut} className="btn-ghost !px-2.5" aria-label="Log out">⇥</button>
            <button onClick={() => setNotifOpen(true)} className="btn-ghost !px-2.5 relative" aria-label="Notifications">
              🔔
              {notifs.length > 0 && <span className="absolute -top-1 -right-1 size-4 rounded-full bg-ember text-white text-[10px] grid place-items-center">{notifs.length}</span>}
            </button>
            <ThemeToggle />
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-paper/95 backdrop-blur grid grid-cols-7 h-16 pb-[env(safe-area-inset-bottom)]">
        {[LINKS[0], LINKS[1], LINKS[2], LINKS[3], LINKS[4], LINKS[5], LINKS[8]].map((l) => (
          <Link key={l.href} href={l.href}
            className={`flex flex-col items-center justify-center gap-0.5 text-[9px] ${path.startsWith(l.href) ? "text-ember" : "text-ink-2"}`}>
            <span className="text-base" aria-hidden>{l.icon}</span>{l.label.split(" ")[0]}
          </Link>
        ))}
      </nav>

      {notifOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setNotifOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-3 top-3 md:top-16 card w-[min(24rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto p-4 rise" onClick={(e) => e.stopPropagation()}>
            <p className="label mb-2">Notifications</p>
            {notifs.length === 0 ? <p className="text-sm text-ink-2 py-4 text-center">Nothing needs your attention.</p> : (
              <ul className="space-y-3">
                {notifs.map((n) => (
                  <li key={n.id} className="text-sm border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="font-medium">{n.title}</p>
                    {n.body && <p className="text-ink-2 mt-0.5">{n.body}</p>}
                    {n.created_at && <p className="text-xs text-ink-2 mt-0.5">{relTime(n.created_at)}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button onClick={() => act(n.id, "done")} className="btn-ghost !py-1 !px-2 !text-xs">Done</button>
                      <button onClick={() => act(n.id, "snooze")} className="btn-ghost !py-1 !px-2 !text-xs">Snooze</button>
                      <button onClick={() => act(n.id, "dismiss")} className="btn-ghost !py-1 !px-2 !text-xs">Dismiss</button>
                      <button onClick={() => act(n.id, "not_relevant")} className="btn-ghost !py-1 !px-2 !text-xs">Not relevant</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
