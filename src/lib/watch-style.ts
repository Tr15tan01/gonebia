/** Icon + color per watch event kind - shared by the watch list and the
 *  dashboard's "watch found changes" banner. */
export const WATCH_EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  baseline: { icon: "📍", color: "var(--ink-2)" },
  price_drop: { icon: "📉", color: "var(--success)" },
  price_rise: { icon: "📈", color: "var(--danger)" },
  target_hit: { icon: "🎯", color: "var(--success)" },
  back_in_stock: { icon: "✅", color: "var(--success)" },
  out_of_stock: { icon: "⛔", color: "var(--danger)" },
  jobs_added: { icon: "💼", color: "var(--c-task)" },
  jobs_removed: { icon: "🗂️", color: "var(--ink-2)" },
  changed: { icon: "👀", color: "var(--c-decision)" },
  error: { icon: "⚠️", color: "var(--danger)" },
};

export const watchEventStyle = (kind: string) => WATCH_EVENT_STYLE[kind] ?? WATCH_EVENT_STYLE.changed;
