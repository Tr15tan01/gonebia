"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { MEMORY_TYPES } from "@/lib/types";
import { localISO } from "@/lib/dates";
import { DateTimePicker } from "@/components/date-time-picker";
import posthog from "posthog-js";
import { startDictation, speechSupported, type Dictation } from "@/lib/dictation";

const MAX_CHARS = 840;
const COUNTER_FROM = 600;

interface CaptureResult {
  id: string;
  interpretation: string;
  structured: null | {
    title: string; type: string; occurred_at: string | null; due_at: string | null; reminder_at: string | null; review_at: string | null;
  };
  similar: { id: string; title: string; created_at: string; similarity: number }[];
  warnings?: string[];
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
  const [updatingCounts, startUpdatingCounts] = useTransition();

  // Broadcasts the refresh-pending state to anywhere else in the page that
  // wants to react to it (the dashboard's stat cards, via
  // StatsRefreshWrapper) - CaptureBox and the stat cards live in different
  // parts of the component tree (one client, one server-rendered), so a
  // small custom event is the simplest bridge between them.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("timelymemo:refreshing-stats", { detail: updatingCounts }));
  }, [updatingCounts]);
  const recRef = useRef<Dictation | null>(null);
  const usedVoiceRef = useRef(false);
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
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!speechSupported()) { toast("Voice input isn't supported in this browser - try Chrome or Safari."); return; }
    const session = startDictation({
      baseText: text,
      onText: (t) => { if (recRef.current === session) setText(t.slice(0, MAX_CHARS)); },
      onEnd: () => { if (recRef.current === session) { recRef.current = null; setListening(false); } },
      onError: (msg) => toast(msg),
    });
    if (!session) return;
    recRef.current = session;
    usedVoiceRef.current = true;
    setListening(true);
  }

  /* The box grows with the note as you write (and springs back after
     saving), so starting a memory feels like the room making space for it. */
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const min = 2 * 24 + 4; // two rows
    el.style.height = "auto";
    el.style.height = `${Math.min(320, Math.max(min, el.scrollHeight))}px`;
  }, [text]);

  // never leave the microphone running after navigating away
  useEffect(() => () => recRef.current?.stop(), []);

  async function save() {
    if (!text.trim()) return;
    const mic = recRef.current;
    recRef.current = null; // detach first so late transcripts can't refill the box
    mic?.stop();
    setListening(false);
    setSaving(true);
    const source = usedVoiceRef.current ? "voice" : "typed";
    // Signal the dashboard's stat spinners immediately, the moment the
    // button is pressed - not after the AI work finishes. The actual
    // refresh (further down, wrapped in startUpdatingCounts) will re-fire
    // this once real data is ready; dispatching it here just makes the
    // feedback feel instant rather than waiting out the whole save first.
    window.dispatchEvent(new CustomEvent("timelymemo:refreshing-stats", { detail: true }));
    try {
      const res = await fetch("/api/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          source,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          at: atValue ? new Date(atValue).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      posthog.capture("memory_captured", {
        source,
        has_reminder: !!data.structured?.reminder_at,
        has_due_date: !!data.structured?.due_at,
        memory_type: data.structured?.type ?? "thought",
        similar_count: data.similar?.length ?? 0,
        plan: data.plan,
      });
      setResult(data);
      setText("");
      setAtValue("");
      usedVoiceRef.current = false;
      // wrapping in a transition (rather than a plain call) gives us
      // `updatingCounts` below - a real pending flag for exactly how long
      // the dashboard's stat cards take to refetch, instead of the numbers
      // just silently changing a moment later with zero feedback.
      startUpdatingCounts(() => { router.refresh(); });
    } catch (e: any) {
      toast(e.message);
      // nothing will trigger the refresh-driven "done" signal on a failed
      // save, since router.refresh() never runs - turn the spinners back
      // off directly so they don't stay stuck.
      window.dispatchEvent(new CustomEvent("timelymemo:refreshing-stats", { detail: false }));
    }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="card capture-card p-4 focus-within:border-ember">
        <textarea
          ref={areaRef}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
          rows={2}
          maxLength={MAX_CHARS}
          aria-describedby={text.length > COUNTER_FROM ? "capture-counter" : undefined}
          placeholder={listening ? "Listening - speak naturally…" : "Tell TimelyMemo something… \"Slept 7h\", \"Watched Dune\", \"Call mom Friday\""}
          className="capture-area w-full resize-none bg-transparent outline-none text-[15px] placeholder:text-ink-2/60"
          disabled={saving}
        />
        {text.length > COUNTER_FROM && <CharCounter id="capture-counter" used={text.length} max={MAX_CHARS} />}

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              disabled={saving}
              className={`btn-ghost !px-3 ${listening ? "!border-danger !text-danger" : ""}`}
              aria-label={listening ? "Stop listening" : "Start voice input"}
            >{listening ? <span className="pulse-dot" aria-hidden /> : <span aria-hidden>🎤</span>} {listening ? "Stop" : "Voice"}</button>
            <DateTimePicker value={atValue} onChange={setAtValue} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-2 hidden sm:inline" title="Ctrl/⌘ + Enter">⌘↵</span>
            <button onClick={save} disabled={!text.trim() || saving} className="btn-primary">
              {saving ? "Remembering..." : "Remember"}
            </button>
          </div>
        </div>
      </div>

      {/* Both panels grow and shrink smoothly instead of snapping the
         dashboard header to a new height the moment you hit Remember. */}
      <Expand open={saving}>
        <div className="card p-4 mt-3 flex items-center gap-4">
          <div className="loader-ring" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{PHASES[phase]}<span className="loader-dots"><span /><span /><span /></span></p>
            <p className="text-xs text-ink-2 mt-0.5">TimelyMemo is thinking about this — usually a few seconds.</p>
          </div>
        </div>
      </Expand>

      <Expand open={!!result && !saving}>
        <div className="mt-3">
          {result && <Interpretation result={result} onClose={() => setResult(null)} updatingCounts={updatingCounts} />}
        </div>
      </Expand>
    </div>
  );
}

/** Height-animated container. Keeps the last children mounted while closing
 *  so the panel collapses smoothly instead of vanishing. */
function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [held, setHeld] = useState<React.ReactNode>(null);
  useEffect(() => {
    if (open) { setHeld(children); return; }
    const t = setTimeout(() => setHeld(null), 320);
    return () => clearTimeout(t);
  }, [open, children]);
  if (!open && !held) return null;
  return (
    <div
      className="grid transition-all duration-300 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{open ? children : held}</div>
    </div>
  );
}

function Interpretation({ result, onClose, updatingCounts }: { result: CaptureResult; onClose: () => void; updatingCounts: boolean }) {
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
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          <span className="text-ember font-medium">Got it.</span>{" "}
          {result.interpretation}
        </p>
        {updatingCounts && (
          <span className="chip !text-[11px] shrink-0 flex items-center gap-1.5" title="Refreshing your counts">
            <span className="inline-block size-2.5 border-[1.5px] border-ink-2/40 border-t-ember rounded-full animate-spin" />
            Updating...
          </span>
        )}
      </div>

      {result.warnings && result.warnings.length > 0 && (
        <div className="space-y-1.5">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-sm text-ink-2 rounded-xl bg-paper-2 border border-line p-3 leading-relaxed">
              {w}
            </p>
          ))}
        </div>
      )}

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

/** Shows how close the text is to its cap - neutral, then amber, then red. */
export function CharCounter({ used, max, id }: { used: number; max: number; id?: string }) {
  const left = max - used;
  const ratio = used / max;
  const color = left <= 0 ? "var(--danger)" : ratio > 0.9 ? "var(--ember)" : "var(--ink-2)";
  return (
    <div id={id} className="flex items-center justify-end gap-2 mt-1.5 text-xs phase-in" aria-live="polite" style={{ color }}>
      <div className="h-1 w-20 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--ink-2) 15%, transparent)" }} aria-hidden>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      </div>
      <span className="tabular-nums font-medium">{used}/{max}</span>
      {left <= 0 && <span>limit reached</span>}
    </div>
  );
}
