#!/usr/bin/env python3
"""Gonebia - page loaders: shimmer skeleton + brand ring for every route.
New files only + one append to globals.css. Nothing existing is rewritten.
Run from the PROJECT ROOT:  python part22_loaders.py"""

import os

FILES = {}

# ---------- shared loader component ----------
FILES["src/components/page-loader.tsx"] = r'''
/** Instant loading UI for route segments (used by loading.tsx files).
 *  Server-component safe: no hooks, no client directive. */

function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-center gap-4" role="status" aria-live="polite" aria-busy="true">
      <div className="loader-ring" />
      <div>
        <p className="font-display text-lg">{title}<span className="loader-dots"><span /><span /><span /></span></p>
        <p className="text-xs text-ink-2 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="max-w-3xl mx-auto w-full space-y-6">{children}</div>;
}

export function DashboardLoader() {
  return (
    <Page>
      <Header title="Opening your day" sub="Collecting today's threads from your memory" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-[76px] rounded-2xl" />)}
      </div>
      <Sk className="h-28 rounded-2xl" />
      <Sk className="h-20 rounded-2xl" />
      <Sk className="h-20 rounded-2xl" />
      <Sk className="h-14 rounded-2xl" />
    </Page>
  );
}

export function ChatLoader() {
  return (
    <Page>
      <Header title="Waking up your memory" sub="Ready to answer questions about everything you've captured" />
      <div className="space-y-3">
        <Sk className="h-10 w-2/3 rounded-2xl ml-auto" />
        <Sk className="h-16 w-3/4 rounded-2xl" />
        <Sk className="h-10 w-1/2 rounded-2xl ml-auto" />
        <Sk className="h-20 w-5/6 rounded-2xl" />
      </div>
      <div className="flex gap-2 pt-2">
        <Sk className="h-11 flex-1 rounded-xl" />
        <Sk className="h-11 w-20 rounded-xl" />
      </div>
    </Page>
  );
}

export function TasksLoader() {
  return (
    <Page>
      <Header title="Gathering your tasks" sub="Overdue, today, tomorrow and beyond" />
      {["var(--danger)", "var(--ember)", "var(--c-task)", "var(--ink-2)"].map((c, gi) => (
        <div key={gi} className="space-y-2">
          <Sk className="h-4 w-28" />
          <div className="card p-4 space-y-2" style={{ borderLeft: `3px solid ${c}` }}>
            <Sk className="h-4 w-3/4" />
            <Sk className="h-3 w-1/3" />
          </div>
          <div className="card p-4 space-y-2" style={{ borderLeft: `3px solid ${c}` }}>
            <Sk className="h-4 w-2/3" />
            <Sk className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </Page>
  );
}

export function ListLoader({ title, sub }: { title: string; sub: string }) {
  return (
    <Page>
      <Header title={title} sub={sub} />
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-4 space-y-2.5">
            <Sk className={`h-4 ${i % 2 ? "w-2/3" : "w-5/6"}`} />
            <div className="flex gap-1.5">
              <Sk className="h-5 w-16 rounded-full" />
              <Sk className="h-5 w-12 rounded-full" />
              <Sk className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

export function GraphLoader() {
  return (
    <Page>
      <Header title="Mapping connections" sub="People, books, decisions and the lines between them" />
      <div className="card h-[420px] grid place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="loader-ring" style={{ transform: "scale(1.6)" }} />
          <Sk className="h-3 w-40" />
        </div>
      </div>
    </Page>
  );
}

export function SettingsLoader() {
  return (
    <Page>
      <Header title="Opening settings" sub="Your preferences, notifications and data" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-5 space-y-3">
          <Sk className="h-3 w-24" />
          <Sk className="h-9 w-full rounded-xl" />
          <Sk className="h-9 w-2/3 rounded-xl" />
        </div>
      ))}
    </Page>
  );
}

export function GenericLoader() {
  return (
    <Page>
      <Header title="Loading" sub="Reaching into your memory" />
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => <Sk key={i} className={`card h-16 ${i === 1 ? "w-11/12" : ""}`} />)}
      </div>
    </Page>
  );
}
'''

# ---------- per-route loading.tsx ----------
def L(component_call: str) -> str:
    return (
        'import { ' + component_call.split("(")[0] + ' } from "@/components/page-loader";\n\n'
        'export default function Loading() {\n'
        '  return ' + component_call + ';\n}\n'
    )

FILES["src/app/(app)/loading.tsx"] = L("GenericLoader()")
FILES["src/app/(app)/dashboard/loading.tsx"] = L("DashboardLoader()")
FILES["src/app/(app)/tasks/loading.tsx"] = L("TasksLoader()")
FILES["src/app/(app)/chat/loading.tsx"] = L("ChatLoader()")
FILES["src/app/(app)/timeline/loading.tsx"] = L('ListLoader({ title: "Timeline", sub: "Loading your memories, newest first" })')
FILES["src/app/(app)/books/loading.tsx"] = L('ListLoader({ title: "Books", sub: "Opening your shelf" })')
FILES["src/app/(app)/insights/loading.tsx"] = L('ListLoader({ title: "Insights", sub: "Analyzing patterns in your memory" })')
FILES["src/app/(app)/people/loading.tsx"] = L('ListLoader({ title: "People", sub: "Loading everyone in your memory" })')
FILES["src/app/(app)/graph/loading.tsx"] = L("GraphLoader()")
FILES["src/app/(app)/settings/loading.tsx"] = L("SettingsLoader()")

def main():
    # 1. append shimmer CSS to globals.css (idempotent)
    css_path = "src/app/globals.css"
    marker = "@keyframes shimmer"
    addition = '''
/* ---------- page-loader skeletons ---------- */
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
.skeleton {
  border-radius: 0.75rem;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ink-2) 9%, transparent) 25%,
    color-mix(in srgb, var(--ink-2) 17%, transparent) 50%,
    color-mix(in srgb, var(--ink-2) 9%, transparent) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
'''
    with open(css_path, "r", encoding="utf-8") as fh:
        css = fh.read()
    if marker in css:
        print(f"  already patched   {css_path}")
    else:
        with open(css_path, "a", encoding="utf-8", newline="\n") as fh:
            fh.write(addition)
        print(f"  appended CSS      {css_path}")

    # 2. write the loader files
    count = 0
    for path, content in FILES.items():
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(content)
        print(f"  wrote             {path}")
        count += 1
    print(f"\nPart 22 done - {count} loader files + CSS.")
    print("  npm run build")
    print("  git add -A && git commit -m 'Page loaders: shimmer skeletons per route' && git push")

if __name__ == "__main__":
    main()