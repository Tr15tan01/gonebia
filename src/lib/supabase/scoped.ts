import { createAdmin } from "./admin";

/**
 * Now that there's no Supabase-Auth JWT (and therefore no working auth.uid()
 * for RLS to check), the database itself can no longer stop one user's
 * request from touching another user's row - that has to happen in
 * application code instead. Hand-adding `.eq("user_id", ...)` to every query
 * across ~30 files is exactly the kind of thing that's easy to get right 29
 * times and miss once, and "missed once" here means a real cross-user data
 * leak. So instead, this wraps the service-role client so ownership scoping
 * happens structurally, in one place, every time `.from(table)` is used:
 *
 *  - select: automatically filtered to rows owned by this user
 *  - insert / upsert: the owner column is force-set to this user (even if
 *    calling code tries to pass a different one)
 *  - update / delete: automatically restricted to rows owned by this user,
 *    in addition to whatever filters the caller adds
 *
 * For anything this can't safely automate (embedded/joined-table filters
 * like `memory_metadata!inner(...)`, multi-table RPCs, cross-user admin
 * jobs), call sites use `createAdmin()` directly and add the equivalent
 * `.eq(...)` by hand - those are called out with a comment at each site.
 */

const OWNER_COLUMN: Record<string, string> = {
  profiles: "id",
  user_preferences: "user_id",
  subscriptions: "user_id",
  google_integrations: "user_id",
  memories: "user_id",
  memory_metadata: "user_id",
  memory_people: "user_id",
  memory_relationships: "user_id",
  memory_embeddings: "user_id",
  tasks: "user_id",
  events: "user_id",
  purchases: "user_id",
  decisions: "user_id",
  goals: "user_id",
  books: "user_id",
  people: "user_id",
  insights: "user_id",
  daily_briefings: "user_id",
  weekly_analyses: "user_id",
  reminders: "user_id",
  notifications: "user_id",
  push_subscriptions: "user_id",
  usage_counters: "user_id",
  discover_results: "user_id",
  agent_runs: "user_id",
  price_watches: "user_id",
};

function withOwner(payload: any, col: string, userId: string) {
  return Array.isArray(payload)
    ? payload.map((p) => ({ ...p, [col]: userId }))
    : { ...payload, [col]: userId };
}

/** The main entry point: `scoped(userId).from("books")...` behaves like the
 *  real Supabase client, but every read/write is pinned to this one user. */
export function scoped(userId: string) {
  const admin = createAdmin();

  return {
    from(table: string) {
      const col = OWNER_COLUMN[table];
      const qb: any = admin.from(table);
      if (!col) {
        throw new Error(
          `scoped(): table "${table}" has no owner column configured - add it to OWNER_COLUMN in src/lib/supabase/scoped.ts, or use createAdmin() directly with an explicit, reviewed filter if this table is intentionally shared/global.`
        );
      }

      return new Proxy(qb, {
        get(target, prop, receiver) {
          const orig = target[prop];
          if (typeof orig !== "function") return Reflect.get(target, prop, receiver);

          if (prop === "select") {
            return (...args: any[]) => orig.apply(target, args).eq(col, userId);
          }
          if (prop === "insert" || prop === "upsert") {
            return (payload: any, ...rest: any[]) => orig.call(target, withOwner(payload, col, userId), ...rest);
          }
          if (prop === "update" || prop === "delete") {
            return (...args: any[]) => orig.apply(target, args).eq(col, userId);
          }
          return orig.bind(target);
        },
      });
    },
    // Escape hatch for RPCs and anything genuinely cross-cutting - still the
    // service-role client, so the caller remains responsible for passing the
    // user id into the function explicitly (all app RPCs now take p_user).
    rpc: admin.rpc.bind(admin),
  };
}
