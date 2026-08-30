import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";

export function PublicHeader({ cta }: { cta?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="max-w-5xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <Link href="/" aria-label="TimelyMemo home"><Logo /></Link>
        <nav className="flex items-center gap-4 md:gap-6 text-sm">
          <Link href="/#examples" className="text-ink-2 hover:text-ember hidden sm:inline">Examples</Link>
          <Link href="/why" className="text-ink-2 hover:text-ember">Why it matters</Link>
          <Link href="/blog" className="text-ink-2 hover:text-ember">Blog</Link>
          <Link href={cta ?? "/login"} className="btn-primary !py-2">{cta ?? "Sign in"}</Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line py-10">
      <div className="max-w-5xl mx-auto px-6 md:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-2">
        <Link href="/" className="flex items-center gap-2 text-ink"><LogoMark size={20} /> TimelyMemo</Link>
        <nav className="flex items-center gap-5">
          <Link href="/why" className="hover:text-ember">Why it matters</Link>
          <Link href="/blog" className="hover:text-ember">Blog</Link>
          <Link href="/terms" className="hover:text-ember">Terms</Link>
          <Link href="/privacy" className="hover:text-ember">Privacy</Link>
          <Link href="/login" className="hover:text-ember">Sign in</Link>
        </nav>
        <p>Remember things at the right time.</p>
      </div>
    </footer>
  );
}
