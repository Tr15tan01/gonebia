/** Server-side Paddle helpers. Sandbox and live keys talk to different API
 *  hosts - using the live host with a sandbox key (or vice versa) returns
 *  403/404 for every request, which is exactly how "Manage billing does
 *  nothing" looked before. */
export function paddleApiBase(): string {
  const key = process.env.PADDLE_API_KEY ?? "";
  const sandbox = process.env.NEXT_PUBLIC_PADDLE_ENV === "sandbox" || key.includes("_sdbx_");
  return sandbox ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

export function paddleConfigured(): boolean {
  return !!process.env.PADDLE_API_KEY;
}

export async function paddleFetch(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${paddleApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${(process.env.PADDLE_API_KEY ?? "").trim()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) console.error(`[paddle] ${init.method ?? "GET"} ${path} -> ${res.status}`, JSON.stringify(json)?.slice(0, 400));
  return { ok: res.ok, status: res.status, json };
}

export function priceIdFor(tier: "premium" | "pro"): string | undefined {
  return tier === "pro"
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PRO
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_ID_PREMIUM || process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
}
