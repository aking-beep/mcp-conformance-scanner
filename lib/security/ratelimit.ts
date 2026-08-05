// Lightweight rate limiting. Uses Upstash REST when configured; otherwise
// a best-effort in-memory map (per serverless isolate).

type Bucket = { count: number; resetAt: number };

const memory = new Map<string, Bucket>();

function memLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.resetAt <= now) {
    const resetAt = now + windowMs;
    memory.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0, resetAt: cur.resetAt };
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count, resetAt: cur.resetAt };
}

async function upstashLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; remaining: number; resetAt: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const redisKey = `rl:${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(["INCR", redisKey]),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: number };
  const count = Number(data.result ?? 0);
  if (count === 1) {
    await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["EXPIRE", redisKey, windowSec]),
    });
  }
  const resetAt = Date.now() + windowSec * 1000;
  if (count > limit) return { ok: false, remaining: 0, resetAt };
  return { ok: true, remaining: Math.max(0, limit - count), resetAt };
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; remaining: number; resetAt: number }> {
  try {
    const remote = await upstashLimit(key, limit, windowMs);
    if (remote) return remote;
  } catch {
    /* fall through */
  }
  if ((process.env.VERCEL || process.env.NODE_ENV === "production") && !process.env.UPSTASH_REDIS_REST_URL) {
    // Once per isolate — in-memory limits reset on every cold start without Upstash.
    if (!(globalThis as { __mcpRlWarned?: boolean }).__mcpRlWarned) {
      (globalThis as { __mcpRlWarned?: boolean }).__mcpRlWarned = true;
      console.warn(
        "[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN unset — using per-isolate memory (weak on Vercel).",
      );
    }
  }
  return memLimit(key, limit, windowMs);
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export const LIMITS = {
  scan: { limit: Number(process.env.RATE_LIMIT_SCAN || 20), windowMs: 60 * 60 * 1000 },
  badge: { limit: Number(process.env.RATE_LIMIT_BADGE || 60), windowMs: 60 * 60 * 1000 },
  reports: { limit: Number(process.env.RATE_LIMIT_REPORTS || 30), windowMs: 60 * 60 * 1000 },
  access: { limit: Number(process.env.RATE_LIMIT_ACCESS || 30), windowMs: 60 * 60 * 1000 },
};
