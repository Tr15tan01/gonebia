/** Accent color palette. "amber" is the default/original brand color and is
 *  always free - everything else is a Premium/Pro perk (see AccentPicker in
 *  components/theme.tsx). Kept in a plain (non "use client") module so the
 *  server-rendered (app) layout can also import it, to build the init
 *  script that paints the right color on first frame. */
export const ACCENT_COLORS = [
  { id: "amber", label: "Amber (default)", value: "#b45309", dark: "#f0a04b" },
  { id: "emerald", label: "Emerald", value: "#059669", dark: "#34d399" },
  { id: "teal", label: "Teal", value: "#0d9488", dark: "#2dd4bf" },
  { id: "sky", label: "Sky", value: "#0284c7", dark: "#38bdf8" },
  { id: "indigo", label: "Indigo", value: "#4f46e5", dark: "#818cf8" },
  { id: "violet", label: "Violet", value: "#7c3aed", dark: "#a78bfa" },
  { id: "rose", label: "Rose", value: "#e11d48", dark: "#fb7185" },
  { id: "slate", label: "Slate", value: "#475569", dark: "#94a3b8" },
] as const;

export type AccentId = typeof ACCENT_COLORS[number]["id"];

export function accentHex(id: string | null | undefined): string {
  return ACCENT_COLORS.find((c) => c.id === id)?.value ?? ACCENT_COLORS[0].value;
}

/** Light- and dark-mode shades of an accent. Only these two raw values are
 *  set on <html>; globals.css picks one per mode for --ember and derives
 *  --ember-soft from it. Setting --ember itself inline would override the
 *  .dark rules and leave dark mode with the light-mode shade. */
export function accentShades(id: string | null | undefined): { light: string; dark: string } {
  const c = ACCENT_COLORS.find((x) => x.id === id) ?? ACCENT_COLORS[0];
  return { light: c.value, dark: c.dark };
}

/** Inline <script> source, rendered server-side by the (app) layout with the
 *  real DB value already known, so the correct color paints on the very
 *  first frame instead of flashing default amber and then swapping - the
 *  same trick as the dark/light theme init script, just fed from the DB
 *  instead of localStorage since this is account data, not a device setting. */
export function accentInitScript(initial: string): string {
  const { light, dark } = accentShades(initial);
  return `(function(){var s=document.documentElement.style;s.removeProperty('--ember');s.removeProperty('--ember-soft');s.setProperty('--accent','${light}');s.setProperty('--accent-dark','${dark}')})()`;
}
