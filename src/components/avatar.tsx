const PALETTE = [
  "#b45309", "#2563eb", "#059669", "#7c3aed", "#dc2626", "#0284c7",
  "#c026d3", "#d97706", "#16a34a", "#4f46e5", "#0891b2", "#e11d48",
];

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Initials avatar with a stable per-name color. Server-component safe (no hooks). */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const bg = PALETTE[hashName(name) % PALETTE.length];
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none"
      style={{ width: size, height: size, background: bg, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
