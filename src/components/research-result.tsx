"use client";
import { useState } from "react";
import { SmartImage } from "@/components/ui";

export interface RunLike {
  id: string;
  kind: string;
  input: string;
  created_at?: string;
  result: Record<string, any>;
}

export function safeUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch { return null; }
}

function domainOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

const CONFIDENCE: Record<string, { label: string; color: string }> = {
  high: { label: "High confidence", color: "var(--success)" },
  medium: { label: "Medium confidence", color: "var(--ember)" },
  low: { label: "Low confidence", color: "var(--danger)" },
};

function Callout({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 text-sm leading-relaxed"
      style={{ background: `color-mix(in srgb, ${color} 9%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}>
      <p className="font-semibold mb-1" style={{ color }}>{title}</p>
      {children}
    </div>
  );
}

/** Report text with "[S3]" / "[S3, S7]" citations turned into small links
 *  to those sources. */
function Cited({ text, sources }: { text: unknown; sources: { title: string; uri: string }[] }) {
  const parts = String(text ?? "").split(/\s*\[(S\d+(?:\s*,\s*S?\d+)*)\]/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const nums = part.split(",").map((n) => Number(n.trim().replace(/^S/, "")));
        return (
          <sup key={i} className="ml-0.5 whitespace-nowrap">
            {nums.map((n, j) => {
              const src = sources[n - 1];
              if (!src) return null;
              return (
                <a key={j} href={src.uri} target="_blank" rel="noopener noreferrer" title={src.title || domainOf(src.uri)}
                  className="font-semibold no-underline hover:underline mr-0.5" style={{ color: "var(--c-know)" }}>{n}</a>
              );
            })}
          </sup>
        );
      })}
    </>
  );
}

export function ResearchResult({
  run, onFollowUp, onSaveTask, compact = false,
}: {
  run: RunLike;
  onFollowUp?: (q: string) => void;
  onSaveTask?: (text: string) => void;
  compact?: boolean;
}) {
  const r = run.result ?? {};
  const deep = run.kind === "deep_research";
  const sources: { title: string; uri: string }[] = ((r._sources ?? []) as any[]).filter((s) => safeUrl(s?.uri));
  const grounded = !!r._grounded;
  const [openSection, setOpenSection] = useState<number | null>(0);
  const img = safeUrl(r.image_url);
  const conf = CONFIDENCE[r.confidence?.level as string];

  return (
    <article className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="chip font-semibold" style={{ color: deep ? "var(--c-know)" : "var(--c-idea)" }}>
            {deep ? "🔭 Deep research" : "🔎 Research"}
          </span>
          <span className="chip">{grounded ? "🌐 Web sources" : "⚠️ No live web access - verify facts"}</span>
          {conf && (
            <span className="chip font-semibold" style={{ color: conf.color }} title={r.confidence?.reason}>
              ● {conf.label}
            </span>
          )}
          {run.created_at && <span className="text-ink-2 ml-auto">{new Date(run.created_at).toLocaleString()}</span>}
        </div>
        <h2 className="font-display text-2xl font-bold leading-tight">{r.title || run.input}</h2>
        {r.title && r.title !== run.input && <p className="text-xs text-ink-2">You asked: “{run.input}”</p>}
      </header>

      {img && !compact && (
        <SmartImage src={img} className="block w-full h-56 rounded-2xl" />
      )}

      {r.answer && (
        <div className={deep ? "rounded-2xl p-4 bg-paper-2" : ""}>
          {deep && <p className="label mb-1.5">Bottom line</p>}
          <p className="text-[15px] leading-relaxed"><Cited text={r.answer} sources={sources} /></p>
        </div>
      )}

      {Array.isArray(r.key_numbers) && r.key_numbers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {r.key_numbers.slice(0, 6).map((n: any, i: number) => (
            <div key={i} className="rounded-2xl border border-line p-3">
              <p className="font-display text-xl font-bold" style={{ color: "var(--c-know)" }}>{n.value}</p>
              <p className="text-xs font-semibold mt-0.5">{n.label}</p>
              {n.context && <p className="text-[11px] text-ink-2 mt-0.5 leading-snug">{n.context}</p>}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(r.key_points) && r.key_points.length > 0 && (
        <ul className="space-y-2 text-sm">
          {r.key_points.map((p: any, i: number) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 grid place-items-center size-7 rounded-lg bg-paper-2" aria-hidden>
                {typeof p === "string" ? "•" : (p.icon || "•")}
              </span>
              <span className="pt-1 leading-snug"><Cited text={typeof p === "string" ? p : p.point} sources={sources} /></span>
            </li>
          ))}
        </ul>
      )}

      {Array.isArray(r.sections) && r.sections.length > 0 && (
        <div className="space-y-2">
          <p className="label">Full report</p>
          {r.sections.map((sec: any, i: number) => {
            const open = openSection === i;
            return (
              <div key={i} className="rounded-2xl border border-line overflow-hidden">
                <button onClick={() => setOpenSection(open ? null : i)} aria-expanded={open}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left cursor-pointer hover:bg-paper-2 transition-colors">
                  <span aria-hidden>{sec.icon || "📄"}</span>
                  <span className="font-semibold text-sm flex-1">{sec.heading}</span>
                  <span aria-hidden className={`text-ink-2 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
                </button>
                {open && (
                  <div className="px-4 pb-4 space-y-2.5 text-sm leading-relaxed text-ink-2 phase-in">
                    {String(sec.body ?? "").split(/\n\n+/).map((para, j) => <p key={j}><Cited text={para} sources={sources} /></p>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {Array.isArray(r.timeline) && r.timeline.length > 0 && (
        <div>
          <p className="label mb-2">Timeline</p>
          <ol className="relative border-l-2 ml-1.5 space-y-3" style={{ borderColor: "color-mix(in srgb, var(--c-know) 30%, transparent)" }}>
            {r.timeline.map((t: any, i: number) => (
              <li key={i} className="pl-4 relative text-sm">
                <span aria-hidden className="absolute -left-[7px] top-1.5 size-3 rounded-full" style={{ background: "var(--c-know)" }} />
                <p className="text-xs font-semibold" style={{ color: "var(--c-know)" }}>{t.date}</p>
                <p className="leading-snug">{t.event}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {Array.isArray(r.recommendations) && r.recommendations.length > 0 && (
        <div>
          <p className="label mb-2">What to do with this</p>
          <ul className="space-y-2">
            {r.recommendations.map((rec: any, i: number) => (
              <li key={i} className="rounded-2xl border border-line p-3 flex items-start gap-2.5 text-sm">
                <span className="shrink-0 grid place-items-center size-7 rounded-lg" aria-hidden
                  style={{ background: "color-mix(in srgb, var(--success) 13%, transparent)" }}>{rec.icon || "→"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{rec.action}</span>
                  {rec.why && <span className="block text-ink-2 mt-0.5 leading-snug"><Cited text={rec.why} sources={sources} /></span>}
                </span>
                {onSaveTask && rec.action && (
                  <button onClick={() => onSaveTask(rec.action)} className="btn-ghost !py-1 !px-2 !text-xs shrink-0">+ Task</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(r.debates) && r.debates.length > 0 && (
        <Callout color="var(--c-decision)" title="⚖️ Still debated">
          <ul className="space-y-1.5">
            {r.debates.map((d: any, i: number) => (
              <li key={i}><span className="font-medium">{d.question}</span> <span className="text-ink-2">— {d.sides}</span></li>
            ))}
          </ul>
        </Callout>
      )}

      {Array.isArray(r.gaps) && r.gaps.length > 0 && (
        <Callout color="var(--ink-2)" title="🔍 What we couldn't verify">
          <ul className="list-disc list-inside space-y-1">
            {r.gaps.map((g: string, i: number) => <li key={i}>{g}</li>)}
          </ul>
        </Callout>
      )}

      {r.surprising_fact && <Callout color="var(--c-idea)" title="💡 Worth knowing">{r.surprising_fact}</Callout>}

      {r.try_this && (
        <Callout color="var(--success)" title="✅ Try this">
          <div className="flex items-start justify-between gap-3">
            <span>{r.try_this}</span>
            {onSaveTask && (
              <button onClick={() => onSaveTask(r.try_this)} className="btn-tint !py-1 !px-2.5 !text-xs shrink-0"
                style={{ "--tint": "var(--success)" } as React.CSSProperties}>Save as task</button>
            )}
          </div>
        </Callout>
      )}

      {r.so_what && <Callout color="var(--ember)" title="🎯 For you specifically">{r.so_what}</Callout>}

      {deep && Array.isArray(r.angles) && r.angles.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-2 font-medium">
            How this was researched ({r.angles.filter((a: any) => a.round !== 2).length} angles
            {r.angles.some((a: any) => a.round === 2) ? ` + ${r.angles.filter((a: any) => a.round === 2).length} follow-ups` : ""}
            {sources.length ? ` · ${sources.length} sources` : ""}{r._duration_s ? ` · ${r._duration_s}s` : ""})
          </summary>
          <ol className="mt-2 space-y-1 list-decimal list-inside text-ink-2">
            {r.angles.map((a: any, i: number) => (
              <li key={i}>
                {a.round === 2 && <span className="chip !py-0 !text-[10px] mr-1" style={{ color: "var(--c-know)" }}>follow-up</span>}
                {a.question}{a.why ? <span className="opacity-70"> — {a.why}</span> : null}
              </li>
            ))}
          </ol>
        </details>
      )}

      {onFollowUp && Array.isArray(r.follow_up_questions) && r.follow_up_questions.length > 0 && (
        <div>
          <p className="label mb-2">Keep digging</p>
          <div className="flex flex-wrap gap-2">
            {r.follow_up_questions.map((q: string) => (
              <button key={q} onClick={() => onFollowUp(q)}
                className="chip cursor-pointer !py-1 hover:!border-ember hover:!text-ember text-left">{q}</button>
            ))}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <p className="label mb-2">Sources ({sources.length})</p>
          <ol className="grid sm:grid-cols-2 gap-1.5 text-sm">
            {sources.map((s, i) => (
              <li key={s.uri}>
                <a href={s.uri} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-xl px-2.5 py-2 hover:bg-paper-2 transition-colors">
                  <span className="shrink-0 grid place-items-center size-5 rounded-md text-[10px] font-bold bg-paper-2 text-ink-2">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ember">{s.title && s.title !== s.uri ? s.title : domainOf(s.uri)}</span>
                    {!domainOf(s.uri).includes("vertexaisearch") && (
                      <span className="block truncate text-[11px] text-ink-2">{domainOf(s.uri)}</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  );
}
