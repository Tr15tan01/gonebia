"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MemorySheet } from "@/components/memory";
import { Spinner, useToast } from "@/components/ui";

interface Ref { n: number; id: string; title: string; date: string; snippet: string }
interface Msg { role: "user" | "assistant"; content: string; refs?: Ref[]; detail?: string }

const EXAMPLES = [
  "What did I buy last month?",
  "What does my wife want me to do?",
  "What tasks do I have?",
  "What books did I read this year?",
  "What did Giorgi recommend?",
  "What unfinished things do I have?",
];

export function ChatClient() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [openMemory, setOpenMemory] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sentAuto = useRef(false);
  const toast = useToast();

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    const q = params.get("q");
    if (q && !sentAuto.current) { sentAuto.current = true; send([{ role: "user", content: q }]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function send(history: Msg[] = messages, text?: string) {
    const content = text ?? input.trim();
    if (!content || busy) return;
    const next: Msg[] = [...history, { role: "user", content }];
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
      if (!res.ok) throw new Error(data.error);
      setMessages([...next, { role: "assistant", content: data.answer, refs: data.references, detail: data.detail }]);
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
            <p className="text-ink-2 text-sm">Ask anything about what you've told Gonebia. Every answer links to the memories behind it.</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => send(messages, e)} className="chip cursor-pointer hover:!border-ember hover:!text-ember">{e}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-ember text-white" : "card"}`}>
              {m.role === "assistant"
                ? m.content.split(/(\[\d+\])/g).map((p, j) => {
                    const n = p.match(/^\[(\d+)\]$/)?.[1];
                    if (!n) return <span key={j}>{p}</span>;
                    const ref = m.refs?.find((r) => r.n === +n);
                    return ref ? (
                      <button key={j} onClick={() => setOpenMemory(ref.id)}
                        className="text-ember font-medium align-super text-xs mx-0.5 hover:underline" title={ref.snippet}>[{n}]</button>
                    ) : null;
                  })
                : m.content}
              {m.detail && (
                <p className="mt-2 pt-2 border-t border-line text-xs text-ink-2">Technical detail: {m.detail}</p>
              )}
              {m.refs && m.refs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-line">
                  {m.refs.map((r) => (
                    <button key={r.n} onClick={() => setOpenMemory(r.id)}
                      className="chip hover:!border-ember hover:!text-ember text-left max-w-full">
                      [{r.n}] {r.title.slice(0, 34)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="card px-4 py-3 w-fit"><Spinner /></div>}
        <div ref={bottom} />
      </div>

      <div className="pt-3 flex gap-2">
        <input
          className="input !py-3"
          placeholder="Ask my memory..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()} className="btn-primary">Ask</button>
      </div>

      <MemorySheet id={openMemory} onClose={() => setOpenMemory(null)} />
    </div>
  );
}
