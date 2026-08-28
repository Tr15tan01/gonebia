import type { NextRequest } from "next/server";

/** Cron endpoints accept three auth styles:
 *  - Vercel Cron: Authorization: Bearer $CRON_SECRET (added automatically
 *    when CRON_SECRET is set in the project's environment)
 *  - external schedulers / manual: x-cron-secret header or ?secret= */
export function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (
    req.headers.get("authorization") === `Bearer ${secret}` ||
    req.headers.get("x-cron-secret") === secret ||
    req.nextUrl.searchParams.get("secret") === secret
  );
}
