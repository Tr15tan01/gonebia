const buckets = new Map<string, { count: number; reset: number }>();

/** Simple per-instance token bucket. Fine for a single deploy region;
 *  swap for Upstash/Redis if you scale horizontally. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
