"use client";
import { useEffect, useState } from "react";
import { useToast, Spinner, Empty } from "@/components/ui";
import { UpgradeButton } from "@/components/upgrade-button";
import { relTime } from "@/lib/dates";

const KINDS = [
  { kind: "research", icon: "\ud83d\udd0e", name: "Online Research", ph: "e.g. best glute exercises for desk workers", hint: "Searches the web, connects findings to your memories." },
  { kind: "buying", icon: "\ud83d\uded2", name: "Buying Research", ph: "e.g. 27 inch 4k monitor under $400", hint: "Compares options and can track prices daily." },
  { kind: "solver", icon: "\ud83d\udd75\ufe0f", name: "Problem Solver", ph: "e.g. I keep postponing my portfolio website", hint: "Uses your memories, tasks, calendar & email to build a plan." },
];

/** Deterministic store-search deep links - always land on the item's search
 *  results on that store. Direct URLs for stores with stable search formats;
 *  site-scoped Google for the rest (guaranteed to resolve). */
/** Only real http(s) URLs ever render as links - model junk schemes are dropped. */
function safeUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch { return null; }
}

function optionHref(o: any): string {
  const direct = safeUrl(o?.url);
  if (direct) return direct;
  const q = String(o?.model || o?.name || "").trim();
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
}

function optionStores(o: any) {
  const q = String(o?.model || o?.name || "").trim();
  const enc = encodeURIComponent(q);
  const site = (domain: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${q}`)}`;
  return [
    { name: "Amazon", url: `https://www.amazon.com/s?k=${enc}` },
    { name: "eBay", url: `https://www.ebay.com/sch/i.html?_nkw=${enc}` },
    { name: "AliExpress", url: site("aliexpress.com") },
    { name: "Alta", url: site("alta.ge") },
    { name: "PCShop", url: site("pcshop.ge") },
  ];
}

function storeLinks(q: string) {
  const enc = encodeURIComponent(q);
  const site = (domain: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${q}`)}`;
  return [
    { name: "Amazon", url: `https://www.amazon.com/s?k=${enc}` },
    { name: "eBay", url: `https://www.ebay.com/sch/i.html?_nkw=${enc}` },
    { name: "Walmart", url: `https://www.walmart.com/search?q=${enc}` },
    { name: "AliExpress", url: site("aliexpress.com") },
    { name: "Alta", url: site("alta.ge") },
    { name: "PCShop", url: site("pcshop.ge") },
    { name: "Zoomer", url: site("zoomer.ge") },
  ];
}

export function AgentsClient({ plan, used, limit }: { plan: string; used: number; limit: number }) {
  const [kind, setKind] = useState("research");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [grounded, setGrounded] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [watches, setWatches] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  const toast = useToast();
  const outOfRuns = used >= limit;
  const current = KINDS.find((k) => k.kind === kind)!;

  async function loadSide() {
    const [w, h] = await Promise.all([
      fetch("/api/agents/watch").then((r) => r.json()).catch(() => null),
      fetch("/api/agents").then((r) => r.json()).catch(() => null),
    ]);
    setWatches(w?.watches ?? []);
    setHistory(h?.runs ?? []);
  }
  useEffect(() => { loadSide(); }, []);

  async function go() {
    if (!input.trim() || busy) return;
    setBusy(true); setRun(null); setSources([]); setGrounded(false); setRunError(null); setWatchError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, input }),
      });
      const d = await res.json();
      if (d.code === "limit") { toast(d.error); return; }
      if (d.error) { setRunError(d.detail ? `${d.error} (${d.detail})` : d.error); return; }
      setRun(d.run); setGrounded(!!d.grounded);
      setSources(((d.sources ?? []) as any[]).filter((s: any) => s?.uri));
      loadSide();
    } catch { setRunError("The agent couldn't finish - please try again."); }
    finally { setBusy(false); }
  }

  async function stopWatch(id: string) {
    await fetch(`/api/agents/watch?id=${id}`, { method: "DELETE" });
    loadSide();
  }

  async function addTask(action: string) {
    const res = await fetch("/api/capture", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `I need to ${action}`, source: "typed", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    const d = await res.json();
    toast(res.ok ? "Saved as a task in your memory." : (d.error ?? "Couldn't save."));
  }

  async function track() {
    if (!input.trim()) return;
    setWatchError(null);
    const res = await fetch("/api/agents/watch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input }),
    });
    const d = await res.json().catch(() => ({}));
    if (d.code === "limit" || d.error) {
      setWatchError(d.error ?? "Couldn't start tracking.");
      return;
    }
    toast("Tracking - you'll get a notification if the price drops meaningfully (checked daily).");
    loadSide();
  }

  const result = run?.result ?? {};

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Agents</h1>
        <p className="text-sm text-ink-2 mt-1">
          Research assistants with web access, grounded in your own context.
          {plan === "free" && <> {used}/{limit} runs used this month.</>}
        </p>
      </header>

      {outOfRuns && (
        <div className="card p-4 text-sm" style={{ background: "var(--ember-soft)", borderColor: "color-mix(in srgb, var(--ember) 30%, transparent)" }}>
          <p className="font-medium">Monthly agent runs used up</p>
          <p className="text-ink-2 mt-1">Pro includes 50 runs/month and price tracking.</p>
          <UpgradeButton className="mt-3 !py-1.5 !text-xs" />
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => { setKind(k.kind); setRun(null); }}
            className={`card p-4 text-left cursor-pointer hover:border-ember/60 transition-colors ${kind === k.kind ? "!border-ember" : ""}`}>
            <p className="font-medium">{k.icon} {k.name}</p>
            <p className="text-xs text-ink-2 mt-1">{k.hint}</p>
          </button>
        ))}
      </div>

      <div className="card p-5 space-y-3">
        <input className="input !py-3" placeholder={current.ph} value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()} disabled={busy || outOfRuns} />
        <div className="flex gap-2">
          <button onClick={go} disabled={busy || !input.trim() || outOfRuns} className="btn-primary flex-1">
            {busy ? "Working..." : "Run agent"}
          </button>
          {kind === "buying" && (
            <button onClick={track} disabled={busy || !input.trim()} className="btn-ghost" title="Check daily, notify on deals">
              Track price
            </button>
          )}
        </div>
        {busy && (
          <div className="text-center py-8 flex flex-col items-center gap-3">
            <div className="run-ring" />
            <p className="text-sm font-medium">
              {kind === "solver" ? "Investigating your context" : "Researching"}<span className="loader-dots"><span /><span /><span /></span>
            </p>
            <p className="text-xs text-ink-2">
              {kind === "solver" ? "Memories, tasks, calendar and email - this takes up to a minute." : "Searching the web - usually 10-30 seconds."}
            </p>
          </div>
        )}
      </div>

      {runError && !busy && (
        <div className="card p-4 text-sm" style={{ background: "var(--danger-soft)", borderLeft: "3px solid var(--danger)" }}>
          <p className="font-medium" style={{ color: "var(--danger)" }}>Run didn't complete</p>
          <p className="text-ink-2 mt-1">{runError}</p>
        </div>
      )}

      {run && !busy && (
        <div className="card p-5 space-y-4 rise">
          <p className="text-xs text-ink-2">
            {grounded ? "\ud83c\udf10 Web-grounded" : "\u26a0\ufe0f Answered without web grounding (model/key limitation)"} {" - "}
            {new Date(run.created_at).toLocaleTimeString()}
          </p>

          {result.answer && <p className="text-[15px] leading-relaxed">{result.answer}</p>}
          {result.recommendation && <p className="font-display text-lg">{result.recommendation}</p>}
          {result.understanding && <p className="text-[15px] leading-relaxed">{result.understanding}</p>}

          {(result.key_points ?? []).length > 0 && (
            <ul className="list-disc list-inside text-sm text-ink-2 space-y-1">
              {result.key_points.map((p: string) => <li key={p}>{p}</li>)}
            </ul>
          )}

          {result.so_what && (
            <div className="card p-4 text-sm" style={{ background: "var(--ember-soft)" }}>
              <p className="label mb-1">For you specifically</p>{result.so_what}
            </div>
          )}

          {(result.options ?? []).map((o: any, i: number) => (
            <div key={i} className="card p-4 text-sm">
              <div className="flex justify-between gap-2">
                <a href={optionHref(o)} target="_blank" rel="noopener noreferrer"
                  className="font-medium cursor-pointer hover:text-ember hover:underline underline-offset-2"
                  title={safeUrl(o?.url) ? "Open product page (model-provided - verify it loaded correctly)" : "Search this exact model on Amazon"}>
                  {o.name} {'\u2197'}
                </a>
                <span className="chip">{o.approx_price}</span>
              </div>
              <p className="text-ink-2 mt-1"><span style={{ color: "var(--success)" }}>+</span> {o.pros}</p>
              <p className="text-ink-2"><span style={{ color: "var(--danger)" }}>-</span> {o.cons}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {optionStores(o).map((s) => (
                  <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="chip !text-[11px] cursor-pointer hover:!border-ember hover:!text-ember">{s.name}</a>
                ))}
              </div>
            </div>
          ))}

          {result.first_move && (
            <div className="card p-4" style={{ borderLeft: "3px solid var(--ember)" }}>
              <p className="label mb-1" style={{ color: "var(--ember)" }}>First move</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{result.first_move}</p>
                <button onClick={() => addTask(result.first_move)} className="btn-ghost !py-1.5 !text-xs shrink-0">Save as task</button>
              </div>
            </div>
          )}

          {(result.steps ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="label">Action plan</p>
              {(result.steps ?? []).map((s: any, i: number) => (
                <div key={i} className="card p-4 text-sm flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{i + 1}. {s.action}</p>
                    {s.detail && <p className="text-ink-2 mt-1">{s.detail}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`chip ${s.effort === "quick" ? "chip-c-buy" : s.effort === "big" ? "chip-c-book" : ""}`}>{s.effort}</span>
                    <button onClick={() => addTask(s.action)} className="text-xs text-ember hover:underline cursor-pointer">save as task</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.advice && <p className="text-sm text-ink-2">{result.advice}</p>}

          {kind === "buying" && input.trim() && (
            <div>
              <p className="label mb-2">Compare on stores <span className="normal-case">(opens store search)</span></p>
              <div className="flex flex-wrap gap-2">
                {storeLinks(input).map((s) => (
                  <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="chip cursor-pointer hover:!border-ember hover:!text-ember">
                    {s.name} {'\u2197'}
                  </a>
                ))}
              </div>
            </div>
          )}

          {sources.length > 0 && (
            <div>
              <p className="label mb-2">{grounded ? "Sources (web)" : "Sources (model-provided - verify before relying on them)"}</p>
              <ul className="space-y-1.5 text-sm">
                {sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-ember hover:underline">{s.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {kind === "buying" && input.trim() && (
        <div className="card p-5 space-y-3 soft-shadow">
          <div>
            <p className="label mb-2">Compare "{input.slice(0, 60)}" on stores <span className="normal-case">(opens store search)</span></p>
            <div className="flex flex-wrap gap-2">
              {storeLinks(input).map((s) => (
                <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="chip cursor-pointer hover:!border-ember hover:!text-ember">
                  {s.name} {'\u2197'}
                </a>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={track} className="btn-ghost !py-1.5 !text-xs">
              Track "{input.slice(0, 30)}" for price drops
            </button>
            <span className="text-xs text-ink-2">checked daily - you'll get a notification on meaningful drops</span>
          </div>
          {watchError && (
            <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", borderLeft: "3px solid var(--danger)" }}>
              <p style={{ color: "var(--danger)" }} className="font-medium">Watch limit</p>
              <p className="text-ink-2 mt-0.5">{watchError}</p>
            </div>
          )}
        </div>
      )}

      {watches.length > 0 && (
        <section>
          <h2 className="label mb-2.5">Price watches ({watches.filter((w) => w.status === "active").length} active)</h2>
          <ul className="space-y-2">
            {watches.map((w) => (
              <li key={w.id} className="card p-4 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{w.query}</p>
                  <p className="text-xs text-ink-2 mt-0.5">
                    {w.status === "active" ? "checking daily" : "stopped"}
                    {w.last_price != null && ` - last estimate: ${w.last_price}`}
                    {w.last_checked && ` - ${relTime(w.last_checked)}`}
                  </p>
                </div>
                {w.status === "active" && (
                  <button onClick={() => stopWatch(w.id)} className="btn-ghost !py-1 !px-2 !text-xs shrink-0">Stop</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="label mb-2.5">Recent runs</h2>
          <ul className="card divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="p-4 text-sm flex justify-between gap-3">
                <span className="min-w-0 truncate">{KINDS.find((k) => k.kind === h.kind)?.icon} {h.input}</span>
                <span className="text-xs text-ink-2 whitespace-nowrap">{relTime(h.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length === 0 && watches.length === 0 && !run && (
        <Empty icon="\u26a1" title="No agent runs yet." hint="Ask the research agent anything, or give the problem solver something that's been stuck." />
      )}
    </div>
  );
}
