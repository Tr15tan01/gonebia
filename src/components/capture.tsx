"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { MEMORY_TYPES } from "@/lib/types";
import { localISO } from "@/lib/dates";
import { DateTimePicker } from "@/components/date-time-picker";
import posthog from "posthog-js";

interface CaptureResult {
  id: string;
  interpretation: string;
  structured: null | {
    title: string; type: string; occurred_at: string | null; due_at: string | null; reminder_at: string | null; review_at: string | null;
  };
  similar: { id: string; title: string; created_at: string; similarity: number }[];
}

const PHASES = [
  "Saving your words",
  "Understanding what it means",
  "Extracting dates and people",
  "Finding connections",
];

export function CaptureBox({ autoFocus }: { autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [atValue, setAtValue] = useState("");
  const recRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill");
    if (prefill) setText(prefill);
    if (params.get("capture") === "1" || prefill) areaRef.current?.focus();
  }, []);

  // cycle the phase labels while saving
  useEffect(() => {
    if (!saving) { setPhase(0); return; }
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 1400);
    return () => clearInterval(t);
  }, [saving]);

  function toggleMic() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) { toast("Voice input isn't supported in this browser - try Chrome."); return; }
    if (listening) {
      listeningRef.current = false;
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    const base = text.trim() ? text.trim() + " " : "";
    // Mobile browsers re-send already-final results and silently restart the
    // recognition session. The old closure-accumulation duplicated words.
    // Dedupe finals by GLOBAL result index; the offset grows per restart.
    const finals = new Map<number, string>();
    let offset = 0;
    let sessionCount = 0;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const t = r[0].transcript.trim();
          if (t && !finals.has(offset + i)) finals.set(offset + i, t);
        } else {
          interim += r[0].transcript;
        }
      }
      sessionCount = e.results.length;
      const said = [...finals.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).join(" ");
      setText((base + said + " " + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onend = () => {
      if (listeningRef.current) {
        // Android Chrome ends sessions aggressively - restart while listening.
        offset += sessionCount;
        sessionCount = 0;
        try { rec.start(); } catch { listeningRef.current = false; setListening(false); }
      } else {
        setListening(false);
      }
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        listeningRef.current = false;
        setListening(false);
        toast("Couldn't access the microphone.");
      }
      // "no-speech" / "aborted" are recovered by the onend restart
    };
    recRef.current = rec;
    listeningRef.current = true;
    rec.start();
    setListening(true);
  }

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          source: listening ? "voice" : "typed",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          at: atValue ? new Date(atValue).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      posthog.capture("memory_captured", {
        source: listening ? "voice" : "typed",
        has_reminder: !!data.structured?.reminder_at,
        has_due_date: !!data.structured?.due_at,
        memory_type: data.structured?.type ?? "thought",
        similar_count: data.similar?.length ?? 0,
        plan: data.plan,
      });
      setResult(data);
      setText("");
      setAtValue("");
      router.refresh();
    } catch (e: any) { toast(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="card p-4 focus-within:border-ember transition-colors">
        <textarea
          ref={areaRef}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
          rows={2}
          placeholder="Tell Gonebia something..."
          className="w-full resize-none bg-transparent outline-none text-[15px] placeholder:text-ink-2/60"
          disabled={saving}
        />

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              disabled={saving}
              className={`btn-ghost !px-3 ${listening ? "!border-ember !text-ember animate-pulse" : ""}`}
              aria-label={listening ? "Stop listening" : "Start voice input"}
            >🎤 {listening ? "Listening..." : "Voice"}</button>
            <DateTimePicker value={atValue} onChange={setAtValue} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-2 hidden sm:inline">⌘↵</span>
            <button onClick={save} disabled={!text.trim() || saving} className="btn-primary">
              {saving ? "Remembering..." : "Remember"}
            </button>
          </div>
        </div>
      </div>

      {saving && (
        <div className="card p-4 rise flex items-center gap-4">
          <div className="loader-ring" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{PHASES[phase]}<span className="loader-dots"><span /><span /><span /></span></p>
            <p className="text-xs text-ink-2 mt-0.5">Gonebia is thinking about this — usually a few seconds.</p>
          </div>
        </div>
      )}

      {result && <Interpretation result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function Interpretation({ result, onClose }: { result: CaptureResult; onClose: () => void }) {
  const s = result.structured;
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(s?.title ?? "");
  const [type, setType] = useState(s?.type ?? "thought");
  const [occurred, setOccurred] = useState(s?.occurred_at ? localISO(new Date(s.occurred_at)) : "");
  const [due, setDue] = useState(s?.due_at ? localISO(new Date(s.due_at)) : "");
  const [reminder, setReminder] = useState(s?.reminder_at ? localISO(new Date(s.reminder_at)) : "");
  const [saving, setSaving] = useState(false);
  const [goalCreated, setGoalCreated] = useState(false);
  const toast = useToast();

  async function correct() {
    setSaving(true);
    const patch: Record<string, unknown> = {
      type,
      occurred_at: occurred ? new Date(occurred).toISOString() : null,
      due_at: due ? new Date(due).toISOString() : null,
      reminder_at: reminder ? new Date(reminder).toISOString() : null,
    };
    if (title.trim()) patch.title = title.trim();
    await fetch(`/api/memories/${result.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    posthog.capture("memory_corrected", { new_type: type });
    setSaving(false); setEdit(false);
    toast("Corrected - thank you.");
  }

  async function createGoal() {
    await fetch("/api/goals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "Untitled goal", from_memory_id: result.id }),
    });
    posthog.capture("goal_created_from_memory", { similar_count: result.similar.length });
    setGoalCreated(true);
    toast("Goal created.");
  }

  return (
    <div className="card p-4 border-ember/40 rise space-y-3">
      <p className="text-sm">
        <span className="text-ember font-medium">Got it.</span>{" "}
        {result.interpretation}
      </p>

      {result.similar.length >= 1 && (
        <div className="rounded-xl bg-ember-soft p-3 text-sm">
          <p className="font-medium">🧠 You've mentioned something similar before.</p>
          <ul className="mt-1.5 space-y-1 text-ink-2">
            {result.similar.map((h) => (
              <li key={h.id}>
                {new Date(h.created_at).toLocaleDateString()} - "{h.title}"
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-ink-2">This seems to be a recurring thought.</p>
          <button onClick={createGoal} disabled={goalCreated} className="btn-ghost mt-2 !py-1.5 !text-xs">
            {goalCreated ? "Goal created ✓" : "Create a goal"}
          </button>
        </div>
      )}

      {edit ? (
        <div className="space-y-2 text-sm">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as any)} aria-label="Type">
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input className="input" value={due} onChange={(e) => setDue(e.target.value)} type="datetime-local" aria-label="Due date" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-2">Happened
              <input className="input mt-1" type="datetime-local" value={occurred} onChange={(e) => setOccurred(e.target.value)} />
            </label>
            <label className="text-xs text-ink-2">Remind me
              <input className="input mt-1" type="datetime-local" value={reminder} onChange={(e) => setReminder(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={correct} disabled={saving} className="btn-primary !py-1.5 !text-xs">{saving ? "Saving..." : "Save correction"}</button>
            <button onClick={() => setEdit(false)} className="btn-ghost !py-1.5 !text-xs">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setEdit(true)} className="btn-ghost !py-1.5 !text-xs">Not quite right? Correct it</button>
          <button onClick={onClose} className="btn-ghost !py-1.5 !text-xs">Done</button>
        </div>
      )}
    </div>
  );
}
