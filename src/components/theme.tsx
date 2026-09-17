"use client";
import { useEffect, useState } from "react";
import { ACCENT_COLORS, accentHex, type AccentId } from "@/lib/accent-colors";

export function useTheme() {
  const [theme, setTheme] = useState<string>("system");
  useEffect(() => { setTheme(localStorage.getItem("timelymemo-theme") ?? "system"); }, []);
  const apply = (t: string) => {
    localStorage.setItem("timelymemo-theme", t);
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    setTheme(t);
  };
  return { theme, apply };
}

export const FONT_SIZES = [
  { id: "s", label: "Small", px: 15 },
  { id: "m", label: "Default", px: 16 },
  { id: "l", label: "Large", px: 17 },
  { id: "xl", label: "Larger", px: 18 },
] as const;

/** Text size is a per-device preference (like theme), stored locally and
 *  applied to the root font size - every rem-based size in the app scales
 *  with it, so the whole interface grows or shrinks a little together. */
export function FontSizePicker() {
  const [size, setSize] = useState<string>("m");
  useEffect(() => { setSize(localStorage.getItem("timelymemo-fontsize") ?? "m"); }, []);

  const apply = (id: string) => {
    const px = FONT_SIZES.find((f) => f.id === id)?.px ?? 16;
    document.documentElement.style.fontSize = `${px}px`;
    localStorage.setItem("timelymemo-fontsize", id);
    setSize(id);
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-medium">Text size</p>
        <p className="text-xs text-ink-2">Applies to this device only.</p>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Text size">
        {FONT_SIZES.map((f) => (
          <button key={f.id} role="radio" aria-checked={size === f.id} onClick={() => apply(f.id)}
            className={`chip cursor-pointer !px-3 ${size === f.id ? "!bg-ember !text-white !border-ember" : ""}`}
            style={{ fontSize: `${f.px - 4}px` }}>
            A
            <span className="sr-only">{f.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeToggle({ size = "sm" }: { size?: "sm" | "lg" }) {
  const { theme, apply } = useTheme();
  return (
    <button
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      className={`btn-ghost !px-2.5 ${size === "lg" ? "text-xl" : ""}`}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function applyAccentToDOM(hex: string) {
  const root = document.documentElement.style;
  root.setProperty("--ember", hex);
  root.setProperty("--ember-soft", `color-mix(in srgb, ${hex} 12%, transparent)`);
}

export type { AccentId };

/** Reads/writes the chosen accent color, persisted server-side in
 *  `user_preferences.accent_color` (same table/endpoint as theme) so it
 *  follows the account across devices instead of being stuck on one
 *  browser's localStorage. `initial` is whatever the server already loaded
 *  for this user - `canCustomize` re-derives from the live plan, so a
 *  lapsed subscription can't keep a stale custom color server never
 *  intended it to have. */
export function useAccent(initial: string | null | undefined, canCustomize: boolean) {
  const [accent, setAccent] = useState<AccentId>((canCustomize ? initial : null) as AccentId ?? "amber");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const effective = (canCustomize ? initial : "amber") as AccentId ?? "amber";
    setAccent(effective);
    applyAccentToDOM(accentHex(effective));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, canCustomize]);

  async function apply(id: AccentId) {
    if (!canCustomize && id !== "amber") return;
    const previous = accent;
    setAccent(id); // optimistic - instant visual feedback
    applyAccentToDOM(accentHex(id));
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent_color: id }),
      });
      if (!res.ok) {
        setAccent(previous);
        applyAccentToDOM(accentHex(previous));
        return false;
      }
      return true;
    } catch {
      setAccent(previous);
      applyAccentToDOM(accentHex(previous));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { accent, apply, saving };
}

/** Swatch grid for Settings. Free users see every swatch but locked ones are
 *  disabled with a tooltip pointing at the upgrade page - the point is to
 *  show what's available, not hide it. */
export function AccentPicker({ initial, canCustomize, onSaved }: {
  initial: string | null | undefined; canCustomize: boolean; onSaved?: (msg: string) => void;
}) {
  const { accent, apply, saving } = useAccent(initial, canCustomize);
  return (
    <div className="flex flex-wrap gap-2">
      {ACCENT_COLORS.map((c) => {
        const locked = !canCustomize && c.id !== "amber";
        return (
          <button
            key={c.id}
            type="button"
            onClick={async () => { if (await apply(c.id)) onSaved?.("Accent color saved."); }}
            disabled={locked || saving}
            title={locked ? "Upgrade to Premium to unlock more colors" : c.label}
            aria-label={c.label}
            aria-pressed={accent === c.id}
            className={`size-8 rounded-full border-2 transition-transform cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${accent === c.id ? "scale-110" : "hover:scale-105"}`}
            style={{ background: c.value, borderColor: accent === c.id ? "var(--ink)" : "transparent" }}
          />
        );
      })}
    </div>
  );
}
