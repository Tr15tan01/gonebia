/** Accent color palette. "amber" is the default/original brand color and is
 *  always free - everything else is a Premium/Pro perk (see AccentPicker in
 *  components/theme.tsx). Kept in a plain (non "use client") module so the
 *  server-rendered (app) layout can also import it, to build the init
 *  script that paints the right color on first frame. */
export const ACCENT_COLORS = [
  { id: "amber", label: "Amber (default)", value: "#b45309" },
  { id: "emerald", label: "Emerald", value: "#059669" },
  { id: "teal", label: "Teal", value: "#0d9488" },
  { id: "sky", label: "Sky", value: "#0284c7" },
  { id: "indigo", label: "Indigo", value: "#4f46e5" },
  { id: "violet", label: "Violet", value: "#7c3aed" },
  { id: "rose", label: "Rose", value: "#e11d48" },
  { id: "slate", label: "Slate", value: "#475569" },
] as const;

export type AccentId = typeof ACCENT_COLORS[number]["id"];

export function accentHex(id: string | null | undefined): string {
  return ACCENT_COLORS.find((c) => c.id === id)?.value ?? ACCENT_COLORS[0].value;
}

/** Inline <script> source, rendered server-side by the (app) layout with the
 *  real DB value already known, so the correct color paints on the very
 *  first frame instead of flashing default amber and then swapping - the
 *  same trick as the dark/light theme init script, just fed from the DB
 *  instead of localStorage since this is account data, not a device setting. */
export function accentInitScript(initial: string): string {
  const hex = accentHex(initial);
  return `document.documentElement.style.setProperty('--ember','${hex}');document.documentElement.style.setProperty('--ember-soft','color-mix(in srgb, ${hex} 12%, transparent)')`;
}
