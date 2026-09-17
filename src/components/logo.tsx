/** Inline logo - no asset loading. The mark is a clock face whose hand ends
 *  in a remembered moment: time + memory. Adapts to the accent color. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="tm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c2a5c" />
          <stop offset="1" stopColor="#15142b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#tm-bg)" />
      <circle cx="32" cy="33" r="17" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
      <path d="M32 16 A17 17 0 1 1 15.8 38.2" fill="none" stroke="var(--ember)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 33 L32 23" stroke="#f3f2fb" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M32 33 L40 38" stroke="#f3f2fb" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="15.8" cy="38.2" r="4.2" fill="var(--ember)" />
      <circle cx="32" cy="33" r="2.6" fill="#f3f2fb" />
    </svg>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display text-xl font-bold leading-none tracking-tight">
        Timely<span className="font-medium opacity-70">Memo</span>
      </span>
    </span>
  );
}
