"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MemorySheet } from "@/components/memory";
import { useToast } from "@/components/ui";
import posthog from "posthog-js";
import { CharCounter } from "@/components/capture";

const MAX_Q = 180;
const Q_COUNTER_FROM = 100;

interface Ref { n: number; id: string; title: string; date: string; snippet: string }
interface Msg { role: "user" | "assistant"; content: string; refs?: Ref[]; detail?: string; fresh?: boolean }

const EXAMPLES = [
  "What did I buy last month?",
  "What does my wife want me to do?",
  "What tasks do I have?",
  "What books did I read this year?",
  "What did Giorgi recommend?",
  "What unfinished things do I have?",
];

const PHASES = [
  { text: "Understanding your question", icon: "\ud83e\udd14", color: "var(--c-ask)" },
  { text: "Searching your memories", icon: "\ud83d\udd0e", color: "var(--ember)" },
  { text: "Connecting the dots", icon: "\u2728", color: "var(--c-idea)" },
  { text: "Composing an answer", icon: "\ud83d\udcac", color: "var(--c-decision)" },
];

export function ChatClient() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [openMemory, setOpenMemory] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sentAuto = useRef(false);
  const toast = useToast();

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  // cycles through the phase labels below while a question is being answered
  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1400);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => {
    const q = params.get("q");
    if (q && !sentAuto.current) { sentAuto.current = true; send([], q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function send(history: Msg[] = messages, text?: string) {
    const content = text ?? input.trim();
    if (!content || busy) return;
    const next: Msg[] = [...history, { role: "user", content }];
    posthog.capture("chat_question_asked", {
      turn_number: next.filter((m) => m.role === "user").length,
    });
    setMessages(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "limit") {
          setMessages([...next, { role: "assistant", content: data.error }]);
          if (data.upgrade) toast("Upgrade to Pro from Settings or the landing page for 500 questions/month.");
          return;
        }
        throw new Error(data.error);
      }
      setMessages([
        ...next.map((m) => ({ ...m, fresh: false })),
        { role: "assistant", content: data.answer, refs: data.references, detail: data.detail, fresh: true },
      ]);
    } catch (e: any) {
      toast(e.message); setMessages(next);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)]">
      <h1 className="font-display text-2xl mb-3">Ask my memory</h1>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-ink-2 text-sm">Ask anything about what you've told TimelyMemo. Every answer links to the memories behind it.</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(messages, e)} className="chip cursor-pointer hover:!border-ember hover:!text-ember">{e}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`fade-up ${m.role === "user" ? "flex justify-end" : ""}`}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed bg-ember text-white">{m.content}</div>
            ) : (
              <AssistantMessage msg={m} onOpen={setOpenMemory} />
            )}
          </div>
        ))}
        {busy && (
          <div className="card p-5 w-fit flex items-center gap-3.5">
            <div className="run-ring" style={{ "--run-ring-color": PHASES[phase].color } as React.CSSProperties} />
            <p className="text-sm font-medium transition-colors duration-500" style={{ color: PHASES[phase].color }}>
              <span className="mr-1.5">{PHASES[phase].icon}</span>
              {PHASES[phase].text}<span className="loader-dots"><span /><span /><span /></span>
            </p>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <div className="pt-3">
        <div className="flex gap-2">
          <input
            className="input !py-3"
            placeholder="Ask my memory..."
            value={input}
            maxLength={MAX_Q}
            aria-describedby={input.length > Q_COUNTER_FROM ? "question-counter" : undefined}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_Q))}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button onClick={() => send()} disabled={busy || !input.trim()} className="btn-primary">Ask</button>
        </div>
        {input.length > Q_COUNTER_FROM && <CharCounter id="question-counter" used={input.length} max={MAX_Q} />}
      </div>

      <MemorySheet id={openMemory} onClose={() => setOpenMemory(null)} />
    </div>
  );
}

/** An answer that writes itself in word by word (only when it's new), with
 *  its source memories as large clickable cards underneath. */
function AssistantMessage({ msg, onOpen }: { msg: Msg; onOpen: (id: string) => void }) {
  const tokens = useMemo(() => msg.content.split(/(\[\d+\]|\s+)/g).filter((t) => t !== ""), [msg.content]);
  const [shown, setShown] = useState(msg.fresh ? 0 : tokens.length);
  const done = shown >= tokens.length;

  useEffect(() => {
    if (done) return;
    // ~ 40 words a second, faster for long answers so nobody waits > ~4s
    const step = Math.max(1, Math.ceil(tokens.length / 160));
    const t = setTimeout(() => setShown((n) => Math.min(tokens.length, n + step)), 22);
    return () => clearTimeout(t);
  }, [shown, done, tokens.length]);

  const refFor = (n: number) => msg.refs?.find((r) => r.n === n);

  return (
    <div className="max-w-[92%] card rounded-2xl rounded-bl-md px-4 py-3.5 text-[15px] leading-relaxed">
      <p className="whitespace-pre-wrap">
        {tokens.slice(0, shown).map((tok, j) => {
          const n = tok.match(/^\[(\d+)\]$/)?.[1];
          if (n) {
            const ref = refFor(+n);
            if (!ref) return null;
            return (
              <button key={j} onClick={() => onOpen(ref.id)} title={`Open: ${ref.title}`}
                className="word-in inline-grid place-items-center align-[0.15em] mx-0.5 min-w-[1.35rem] h-[1.35rem] px-1 rounded-full text-[11px] font-bold cursor-pointer transition-transform hover:scale-110"
                style={{ background: "color-mix(in srgb, var(--ember) 16%, transparent)", color: "var(--ember)" }}>
                {n}
              </button>
            );
          }
          return /^\s+$/.test(tok) ? tok : <span key={j} className={msg.fresh ? "word-in" : undefined}>{tok}</span>;
        })}
        {!done && <span className="inline-block w-1.5 h-4 align-middle ml-0.5 rounded-sm bg-ember animate-pulse" aria-hidden />}
      </p>

      {done && msg.detail && (
        <p className="mt-2 pt-2 border-t border-line text-xs text-ink-2 fade-up">Technical detail: {msg.detail}</p>
      )}

      {done && msg.refs && msg.refs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="text-xs font-semibold text-ink-2 mb-2">From your memories</p>
          <ul className="grid gap-2 stagger">
            {msg.refs.map((r) => (
              <li key={r.n}>
                <button onClick={() => onOpen(r.id)}
                  className="group w-full flex items-start gap-3 rounded-xl border border-line p-3 text-left cursor-pointer transition-all hover:border-ember hover:bg-ember-soft hover:-translate-y-px">
                  <span className="grid place-items-center size-7 shrink-0 rounded-full text-xs font-bold"
                    style={{ background: "color-mix(in srgb, var(--ember) 16%, transparent)", color: "var(--ember)" }}>{r.n}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-sm leading-snug group-hover:text-ember">{r.title || "Memory"}</span>
                    {r.snippet && <span className="block text-[13px] text-ink-2 mt-0.5 line-clamp-2">{r.snippet}</span>}
                    {r.date && (
                      <span className="block text-[11px] text-ink-2 mt-1">
                        {(() => {
                          const d = new Date(r.date);
                          return Number.isNaN(d.getTime()) ? r.date : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
                        })()}
                      </span>
                    )}
                  </span>
                  <span aria-hidden className="text-ink-2 group-hover:text-ember self-center transition-transform group-hover:translate-x-0.5">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
