/** Shown instantly by Next.js while the async Dashboard page component runs
 *  server-side - without this, navigating to /dashboard just froze on the
 *  previous page (or a blank screen) until every query finished. This alone
 *  makes navigation feel instant even before any data has loaded. */
function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-paper-2 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <header className="flex items-center gap-3">
        <Pulse className="size-8 shrink-0" />
        <Pulse className="h-7 w-64" />
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => <Pulse key={i} className="h-16" />)}
      </div>
      <Pulse className="h-28" />
      <div className="space-y-2.5">
        <Pulse className="h-4 w-24" />
        <Pulse className="h-16" />
        <Pulse className="h-16" />
      </div>
    </div>
  );
}
