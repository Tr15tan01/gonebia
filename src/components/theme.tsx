"use client";
import { useEffect, useState } from "react";
import { ACCENT_COLORS, accentHex, type AccentId } from "@/lib/accent-colors";

export function useTheme() {
  const [theme, setTheme] = useState<string>("system");
  useEffect(() => { setTheme(localStorage.getItem("gonebia-theme") ?? "system"); }, []);
  const apply = (t: string) => {
    localStorage.setItem("gonebia-theme", t);
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    setTheme(t);
  };
  return { theme, apply };
}

export function ThemeToggle() {
  const { theme, apply } = useTheme();
  return (
    <button onClick={() => apply(theme === "dark" ? "light" : "dark")} className="btn-ghost !px-2.5" aria-label="Toggle theme">
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
