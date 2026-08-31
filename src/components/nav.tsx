"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme";
import { Logo, LogoMark } from "@/components/logo";
import { createClient } from "@/lib/supabase/client";
import { relTime } from "@/lib/dates";

const LINKS = [
  { href: "/dashboard", label: "Today", icon: "\u25cd", color: "var(--ember)" },
  { href: "/tasks", label: "Tasks", icon: "\u2611", color: "var(--c-task)" },
  { href: "/timeline", label: "Timeline", icon: "\u2261", color: "var(--success)" },
  { href: "/chat", label: "Ask my memory", icon: "\u25ce", color: "var(--c-ask)" },
  { href: "/discover", label: "Discover", icon: "\u2726", color: "var(--c-decision)" },
  { href: "/agents", label: "Agents", icon: "\u26a1", color: "var(--c-idea)" },
  { href: "/insights", label: "Insights", icon: "\u25c8", color: "var(--c-goal)" },
  { href: "/books", label: "Books", icon: "\u25a4", color: "var(--c-book)" },
  { href: "/people", label: "People", icon: "\u260f", color: "var(--c-person)" },
  { href: "/graph", label: "Graph", icon: "\u2042", color: "var(--c-know)" },
  { href: "/settings", label: "Settings", icon: "\u2699", color: "var(--ink-2)" },
];

/** Mobile bottom bar: 5 primary destinations; everything else in the More sheet. */
const MOBILE_PRIMARY = [
  { href: "/dashboard", label: "Today", icon: "\u25cd", color: "var(--ember)" },
  { href: "/chat", label: "Ask", icon: "\u25ce", color: "var(--c-ask)" },
  { href: "/discover", label: "Discover", icon: "\u2726", color: "var(--c-decision)" },
  { href: "/agents", label: "Agents", icon: "\u26a1", color: "var(--c-idea)" },
  { href: "/insights", label: "Insights", icon: "\u25c8", color: "var(--c-goal)" },
];
const MOBILE_MORE = [
  { href: "/tasks", label: "Tasks", icon: "\u2611", color: "var(--c-task)" },
  { href: "/timeline", label: "Timeline", icon: "\u2261", color: "var(--success)" },
  { href: "/books", label: "Books", icon: "\u25a4", color: "var(--c-book)" },
  { href: "/people", label: "People", icon: "\u260f", color: "var(--c-person)" },
  { href: "/graph", label: "Graph", icon: "\u2042", color: "var(--c-know)" },
  { href: "/settings", label: "Settings", icon: "\u2699", color: "var(--ink-2)" },
];

const KIND_ICON: Record<string, string> = {
  reminder: "\u23f0",
  forgotten_memory: "\ud83e\udde0",
  connection: "\ud83e\udde9",
  recurring_pattern: "\ud83d\udd04",
  insight: "\ud83d\udc41\ufe0f",
  upcoming_event: "\ud83d\udcc5",
  daily_briefing: "\ud83c\udf05",
  agent_done: "\ud83e\udd16",
  price_watch: "\ud83d\uded2",
  future_note: "\ud83d\udd70\ufe0f",
};

export function AppNav({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [readNotifs, setReadNotifs] = useState<any[]>([]);
  const [viewing, setViewing] = useState<any[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/notifications");
      const d = await r.json();
      setNotifs(d.notifications ?? []);
      setReadNotifs(d.read ?? []);
      setUnreadCount(d.unreadCount ?? 0);
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [notifOpen]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all" }) });
    load();
  }

  function openPanel() {
    setViewing(notifs);
    setNotifOpen(true);
    if (unreadCount > 0) setTimeout(markAllRead, 500);
  }
  function closePanel() {
    setNotifOpen(false);
    setViewing(null);
  }

  /** Optimistic: the row leaves INSTANTLY, the request finishes in the
   *  background under a small "Saving..." indicator. */
  async function act(id: string, action: string) {
    const leaves = action === "done" || action === "dismiss" || action === "not_relevant" || action === "snooze";
    if (leaves) {
      setViewing((v) => (v ? v.filter((x) => x.id !== id) : v));
      setNotifs((n) => n.filter((x) => x.id !== id));
      setUnreadCount((c) => Math.max(0, c - (notifs.some((x) => x.id === id) ? 1 : 0)));
      setActingId(id);
    }
    try {
      await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
    } catch {}
    finally {
      if (leaves) setActingId(null);
      load();
    }
  }

  async function logout() {
    setLoggingOut(true);
    try { await createClient().auth.signOut(); } catch {}
    window.location.href = "/";
  }

  const shown = viewing ?? notifs;
  const inMore = MOBILE_MORE.some((l) => path.startsWith(l.href));

  const bell = () => (
    <button onClick={openPanel} className="btn-ghost !px-2.5 relative" aria-label="Notifications">
      {'\u{1F514}'}
      {unreadCount > 0 && <span className="absolute -top-1 -right-1 size-4 rounded-full bg-ember text-white text-[10px] grid place-items-center">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
  );

  return (
    <div className="min-h-dvh flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-line p-4 gap-1 sticky top-0 h-dvh">
        <Link href="/dashboard" className="px-3 py-4 inline-flex" aria-label="TimelyMemo home"><Logo /></Link>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${path.startsWith(l.href) ? "bg-ember-soft text-ember font-medium" : "text-ink-2 hover:text-ink hover:bg-paper-2"}`}>
            <span aria-hidden style={{ color: l.color }}>{l.icon}</span>{l.label}
          </Link>
        ))}
        <div className="mt-auto flex items-center justify-between px-3 pt-3 border-t border-line">
          {bell()}
          <button onClick={logout} disabled={loggingOut} className="btn-ghost !px-2.5" aria-label="Log out" title="Log out">{'\u21e5'}</button>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-line bg-paper/90 backdrop-blur">
          <Link href="/dashboard" className="inline-flex items-center gap-2" aria-label="TimelyMemo home">
            <LogoMark size={24} /><span className="font-display text-lg">TimelyMemo</span>
          </Link>
          <div className="flex items-center gap-2">
            {bell()}
            <button onClick={logout} disabled={loggingOut} className="btn-ghost !px-2.5" aria-label="Log out">{'\u21e5'}</button>
            <ThemeToggle />
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 pb-28 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom bar: 5 primary + More */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-paper/95 backdrop-blur grid grid-cols-6 h-[74px] pb-[env(safe-area-inset-bottom)]">
        {MOBILE_PRIMARY.map((l) => {
          const active = path.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href}
              className={`flex flex-col items-center justify-center gap-1 ${active ? "text-ember font-medium" : "text-ink-2"}`}>
              <span className="text-[24px] leading-none" aria-hidden style={{ color: l.color }}>{l.icon}</span>
              <span className="text-[12px] leading-tight">{l.label}</span>
            </Link>
          );
        })}
        <button onClick={() => setMoreOpen(true)}
          className="relative flex flex-col items-center justify-center gap-1 text-ink-2 cursor-pointer">
          <span className="text-[24px] leading-none" aria-hidden>{'\u22ef'}</span>
          <span className="text-[12px] leading-tight">More</span>
          {inMore && <span className="absolute top-2.5 right-[30%] size-1.5 rounded-full bg-ember" />}
        </button>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 inset-x-0 card rounded-b-none p-5 pb-8 rise soft-shadow" onClick={(e) => e.stopPropagation()}>
            <p className="label mb-3">More</p>
            <div className="grid grid-cols-3 gap-2.5">
              {MOBILE_MORE.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setMoreOpen(false)}
                  className={`card p-4 flex flex-col items-center gap-1.5 cursor-pointer hover:border-ember/60 ${path.startsWith(l.href) ? "!border-ember" : ""}`}>
                  <span className="text-3xl" aria-hidden style={{ color: l.color }}>{l.icon}</span>
                  <span className="text-sm font-medium">{l.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notification panel */}
      {notifOpen && (
        <div className="fixed inset-0 z-50" onClick={closePanel}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute right-3 top-3 md:top-16 card w-[min(27rem,calc(100vw-1.5rem))] max-h-[75vh] overflow-y-auto p-5 rise soft-shadow" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="label">Notifications</p>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-ember hover:underline cursor-pointer">Mark all read</button>
              )}
            </div>

            {shown.length === 0 && readNotifs.length === 0 && (
              <p className="text-[15px] text-ink-2 py-6 text-center">Nothing needs your attention.</p>
            )}

            {shown.length > 0 && (
              <ul className="space-y-4">
                {shown.map((n, i) => (
                  <li key={n.id} className="notif-item text-[15px] border-b border-line pb-4 last:border-0 last:pb-0"
                    style={{ animationDelay: `${i * 45}ms` }}>
                    <p className="font-medium leading-snug">
                      <span aria-hidden>{KIND_ICON[n.kind] ?? "\U0001F514"}</span> {n.title}
                    </p>
                    {n.body && <p className="text-ink-2 mt-1 leading-snug">{n.body}</p>}
                    {n.created_at && <p className="text-xs text-ink-2 mt-1">{relTime(n.created_at)}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button onClick={() => act(n.id, "read")} className="btn-ghost !py-1 !px-2 !text-xs">Read</button>
                      <button onClick={() => act(n.id, "done")} className="btn-ghost !py-1 !px-2 !text-xs">Done</button>
                      <button onClick={() => act(n.id, "snooze")} className="btn-ghost !py-1 !px-2 !text-xs">Snooze</button>
                      <button onClick={() => act(n.id, "dismiss")} className="btn-ghost !py-1 !px-2 !text-xs">Dismiss</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {actingId && (
              <div className="flex items-center gap-2 text-xs text-ink-2 pt-3 mt-1 border-t border-line" aria-live="polite">
                <span className="inline-block size-3.5 border-2 border-ink-2/30 border-t-ember rounded-full animate-spin" />
                Saving...
              </div>
            )}

            {readNotifs.length > 0 && (
              <div className="mt-4 pt-3 border-t border-line">
                <p className="label mb-2">Earlier</p>
                <ul className="space-y-2.5">
                  {readNotifs.slice(0, 5).map((n: any) => (
                    <li key={n.id} className="text-xs text-ink-2 leading-snug">
                      <span aria-hidden>{KIND_ICON[n.kind] ?? "\U0001F514"}</span> {n.title}
                      <span className="ml-1">· {relTime(n.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
