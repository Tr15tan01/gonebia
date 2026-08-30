/** Inline logo - no asset loading, adapts to light/dark via theme variables. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="16" fill="var(--ink)" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="var(--ember)" strokeWidth="3.5" />
      <circle cx="32" cy="32" r="6.5" fill="var(--ember)" />
      <circle cx="48" cy="16" r="3.5" fill="var(--ember)" />
    </svg>
  );
}

export function Logo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display text-xl leading-none">TimelyMemo</span>
    </span>
  );
}
