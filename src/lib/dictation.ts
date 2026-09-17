"use client";

/**
 * Web Speech dictation that behaves the same on desktop and mobile.
 *
 * Why the old version repeated words on phones:
 *  - Android Chrome often delivers CUMULATIVE results: result[1] already
 *    contains result[0]'s words, so concatenating every final result
 *    doubles text ("how does" + "how does it work").
 *  - With continuous=true Android ends and restarts sessions constantly, and
 *    the next session frequently re-transcribes the tail of the previous one.
 *  - The overlap check only compared up to 12 raw words and was case- and
 *    punctuation-sensitive ("Work." vs "work"), so real overlaps slipped by.
 *
 * Fix: on mobile we use single-utterance sessions (continuous=false) that we
 * restart ourselves, and every piece of text is merged with `mergeText`,
 * which understands cumulative, contained and overlapping segments using
 * normalized word comparison.
 */

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

function startsWithWords(hay: string[], needle: string[]) {
  if (needle.length > hay.length) return false;
  for (let i = 0; i < needle.length; i++) if (norm(hay[i]) !== norm(needle[i])) return false;
  return true;
}

function containsWords(hay: string[], needle: string[]) {
  if (!needle.length) return true;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (norm(hay[i + j]) !== norm(needle[j])) continue outer;
    return true;
  }
  return false;
}

/** Merge `next` onto `prev` without duplicating words that were re-sent. */
export function mergeText(prev: string, next: string): string {
  const a = words(prev);
  const b = words(next);
  if (!a.length) return b.join(" ");
  if (!b.length) return a.join(" ");
  // cumulative: next already includes everything
  if (startsWithWords(b, a)) return b.join(" ");
  // re-sent chunk that we already have (only near the end - a word said
  // again much later is real speech, not a re-transcription)
  if (containsWords(a.slice(-(b.length + 12)), b)) return a.join(" ");
  // tail/head overlap of any length
  for (let n = Math.min(a.length, b.length); n > 0; n--) {
    if (startsWithWords(b, a.slice(-n))) return [...a, ...b.slice(n)].join(" ");
  }
  return [...a, ...b].join(" ");
}

/** Removes back-to-back repeats of 2-8 word phrases ("how does how does"). */
export function collapseRepeats(text: string): string {
  let w = words(text);
  let changed = true;
  while (changed) {
    changed = false;
    for (let n = Math.min(8, Math.floor(w.length / 2)); n >= 2; n--) {
      for (let i = 0; i + 2 * n <= w.length; i++) {
        if (startsWithWords(w.slice(i + n), w.slice(i, i + n))) {
          w = [...w.slice(0, i + n), ...w.slice(i + 2 * n)];
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return w.join(" ");
}

export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);
}

export interface Dictation { stop: () => void }

export function startDictation(opts: {
  baseText: string;
  onText: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  lang?: string;
}): Dictation | null {
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const mobile = isMobileDevice();

  let active = true;
  let committed = opts.baseText.trim();
  let sessionFinal = "";
  let sessionInterim = "";
  let rec: any = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let running = false;

  const emit = () => {
    const shown = mergeText(mergeText(committed, sessionFinal), sessionInterim);
    opts.onText(collapseRepeats(shown));
  };

  const commitSession = (includeInterim: boolean) => {
    let piece = sessionFinal;
    if (includeInterim && sessionInterim) piece = mergeText(piece, sessionInterim);
    committed = collapseRepeats(mergeText(committed, piece));
    sessionFinal = "";
    sessionInterim = "";
  };

  const begin = () => {
    rec = new SR();
    rec.lang = opts.lang || navigator.language || "en-US";
    rec.continuous = !mobile;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      failures = 0;
      let fin = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = String(r[0]?.transcript ?? "").trim();
        if (!t) continue;
        if (r.isFinal) fin = mergeText(fin, t);
        else interim = mobile ? t : mergeText(interim, t); // mobile interim is already cumulative
      }
      sessionFinal = fin;
      // interim that merely repeats finalized words adds nothing
      sessionInterim = interim && !containsWords(words(fin), words(interim)) ? interim : "";
      emit();
    };

    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === "not-allowed" || code === "service-not-allowed") {
        active = false;
        opts.onError("Microphone access is blocked - allow it in your browser settings.");
      } else if (code === "audio-capture") {
        active = false;
        opts.onError("No microphone was found.");
      } else if (code === "network") {
        failures++;
        if (failures >= 3) { active = false; opts.onError("Voice input needs a network connection."); }
      }
      // "no-speech" and "aborted" recover through onend
    };

    rec.onend = () => {
      running = false;
      // keep everything heard so far, including a trailing interim phrase
      commitSession(true);
      emit();
      if (active) {
        restartTimer = setTimeout(() => {
          if (!active) return;
          try { begin(); } catch { active = false; opts.onEnd(); }
        }, mobile ? 120 : 50);
      } else {
        opts.onEnd();
      }
    };

    rec.start();
    running = true;
  };

  try { begin(); } catch {
    opts.onError("Couldn't start voice input.");
    return null;
  }

  return {
    stop() {
      active = false;
      if (restartTimer) clearTimeout(restartTimer);
      if (!running) { opts.onEnd(); return; }
      try { rec?.stop(); } catch { running = false; opts.onEnd(); }
    },
  };
}
