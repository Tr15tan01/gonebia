import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // This is the actual security boundary for the whole /admin section - not
  // a client-side check, not a hidden nav link. Every request for anything
  // under /admin runs this before rendering, and it re-checks the DB role
  // fresh every time (see lib/admin.ts).
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-line px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="font-display text-lg">Admin</Link>
          <nav className="flex items-center gap-3 text-sm text-ink-2">
            <Link href="/admin" className="hover:text-ink">Overview</Link>
            <Link href="/admin/users" className="hover:text-ink">Users</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink-2">
          <span>{admin.email}</span>
          <Link href="/dashboard" className="btn-ghost !py-1 !px-2.5 !text-xs">Back to app</Link>
        </div>
      </header>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  );
}
