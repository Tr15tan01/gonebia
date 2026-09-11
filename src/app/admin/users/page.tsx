import Link from "next/link";
import { createAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const admin = createAdmin();

  let query = admin.from("users")
    .select("id, email, full_name, created_at, role, disabled_at, ai_paused_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) query = query.ilike("email", `%${q}%`);
  const { data: users, count } = await query;

  const ids = (users ?? []).map((u) => u.id);
  const [{ data: subs }, memCounts] = await Promise.all([
    ids.length ? admin.from("subscriptions").select("user_id, plan, status").in("user_id", ids) : Promise.resolve({ data: [] }),
    ids.length
      ? Promise.all(ids.map(async (id) => {
          const { count } = await admin.from("memories").select("id", { count: "exact", head: true }).eq("user_id", id);
          return [id, count ?? 0] as const;
        }))
      : Promise.resolve([]),
  ]);
  const planFor = (id: string) => subs?.find((s: any) => s.user_id === id);
  const memCountFor = (id: string) => memCounts.find(([mid]) => mid === id)?.[1] ?? 0;

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Users ({count ?? 0})</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Search email..." className="input !py-1.5 !text-sm" />
          <button className="btn-ghost !py-1.5 !text-sm">Search</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-2">
              <th className="p-2.5">Email</th>
              <th className="p-2.5">Name</th>
              <th className="p-2.5">Joined</th>
              <th className="p-2.5">Plan</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5">Memories</th>
              <th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const sub = planFor(u.id);
              return (
                <tr key={u.id} className="border-b border-line/60">
                  <td className="p-2.5">{u.email}</td>
                  <td className="p-2.5 text-ink-2">{u.full_name || "-"}</td>
                  <td className="p-2.5 text-ink-2">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="p-2.5">{sub?.plan ?? "free"}</td>
                  <td className="p-2.5">
                    {u.disabled_at ? <span style={{ color: "var(--danger)" }}>Disabled</span>
                      : u.ai_paused_at ? <span style={{ color: "var(--ember)" }}>AI paused</span>
                      : <span style={{ color: "var(--success)" }}>Active</span>}
                    {u.role === "admin" && <span className="chip ml-1.5 !text-[10px]">admin</span>}
                  </td>
                  <td className="p-2.5">{memCountFor(u.id)}</td>
                  <td className="p-2.5"><Link href={`/admin/users/${u.id}`} className="text-ember text-xs">View →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {page > 1 && <Link href={`/admin/users?page=${page - 1}${q ? `&q=${q}` : ""}`} className="btn-ghost !py-1 !px-2.5 !text-xs">← Prev</Link>}
        <span className="text-ink-2 text-xs">Page {page} of {totalPages}</span>
        {page < totalPages && <Link href={`/admin/users?page=${page + 1}${q ? `&q=${q}` : ""}`} className="btn-ghost !py-1 !px-2.5 !text-xs">Next →</Link>}
      </div>
    </div>
  );
}
