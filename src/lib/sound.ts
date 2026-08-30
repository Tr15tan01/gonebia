let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  return ctx;
}

// Autoplay policy: browsers require one user interaction before audio can
// play. Warm the context on any click/keypress so later programmatic
// chimes (notifications, urgent popup) are allowed.
if (typeof window !== "undefined") {
  const warm = () => { try { getCtx()?.resume().catch(() => {}); } catch {} };
  window.addEventListener("pointerdown", warm);
  window.addEventListener("keydown", warm);
}

export function soundEnabled(): boolean {
  try { return localStorage.getItem("gonebia-sound") !== "0"; } catch { return true; }
}

export function setSoundEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem("gonebia-sound");
    else localStorage.setItem("gonebia-sound", "0");
  } catch {}
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, vol: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(vol, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Gentle two-tone chime - new notification arrived. */
export function playChime() {
  if (!soundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") { ac.resume().catch(() => {}); return; }
  const now = ac.currentTime;
  tone(ac, 880.0, now, 0.5, 0.10);        // A5
  tone(ac, 1174.66, now + 0.15, 0.55, 0.10); // D6
}

/** Insistent three-pulse alert - urgent task is due now. */
export function playAlert() {
  if (!soundEnabled()) return;
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") { ac.resume().catch(() => {}); return; }
  const now = ac.currentTime;
  tone(ac, 987.77, now, 0.14, 0.13);        // B5
  tone(ac, 987.77, now + 0.18, 0.14, 0.13); // B5
  tone(ac, 1318.51, now + 0.36, 0.5, 0.13); // E6
}
