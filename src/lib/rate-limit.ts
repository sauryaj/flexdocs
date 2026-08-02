import { NextResponse } from 'next/server';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

let redis: any = null;

async function getRedis(): Promise<any> {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    await redis.connect().catch(() => { redis = null; });
    return redis;
  } catch {
    return null;
  }
}
  
  // In-memory fallback
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(key: string, maxAttempts: number = MAX_ATTEMPTS): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const r = await getRedis();

  if (r) {
    try {
      const redisKey = `ratelimit:${key}`;
      const now = Date.now();
      const ttl = await r.ttl(redisKey) as number;

      if (ttl === -2) {
        // Key doesn't exist
        await r.set(redisKey, '1', 'PX', WINDOW_MS);
        return { allowed: true, remaining: maxAttempts - 1, resetAt: now + WINDOW_MS };
      }

      const count = await r.incr(redisKey);
      if (count === 1) {
        await r.pexpire(redisKey, WINDOW_MS);
      }

      if (count > maxAttempts) {
        const pttl = await r.pttl(redisKey) as number;
        return { allowed: false, remaining: 0, resetAt: now + pttl };
      }

      const pttl = await r.pttl(redisKey) as number;
      return { allowed: true, remaining: Math.max(0, maxAttempts - count), resetAt: now + pttl };
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + WINDOW_MS };
  }

  if (record.count >= maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  return { allowed: true, remaining: maxAttempts - record.count, resetAt: record.resetAt };
}

export function rateLimitResponse(resetAt: number): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: 'Too many attempts. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

// Cleanup stale entries every 5 minutes (in-memory only)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts.entries()) {
    if (now > record.resetAt) {
      attempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/* ============================================================
   PER-ACCOUNT LOGIN LOCKOUT
   Locks a user account after repeated failed attempts.
   ============================================================ */

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const failedLogins = new Map<string, { count: number; lockedUntil: number }>();

export async function checkAccountLockout(identifier: string): Promise<{
  locked: boolean;
  retryAfterMs: number;
}> {
  const r = await getRedis();
  if (r) {
    try {
      const key = `lockout:${identifier}`;
      const raw = await r.get(key);
      if (raw) {
        const data = JSON.parse(raw) as { count: number; lockedUntil: number };
        if (data.lockedUntil > Date.now()) {
          return { locked: true, retryAfterMs: data.lockedUntil - Date.now() };
        }
      }
    } catch {
      // fall through
    }
  }

  const record = failedLogins.get(identifier);
  if (record && record.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  return { locked: false, retryAfterMs: 0 };
}

export async function recordFailedLogin(identifier: string): Promise<{ locked: boolean; retryAfterMs: number }> {
  const r = await getRedis();
  if (r) {
    try {
      const key = `lockout:${identifier}`;
      const raw = await r.get(key);
      let count = 1;
      let lockedUntil = 0;
      if (raw) {
        const data = JSON.parse(raw) as { count: number; lockedUntil: number };
        if (data.lockedUntil > Date.now()) {
          return { locked: true, retryAfterMs: data.lockedUntil - Date.now() };
        }
        count = data.count + 1;
      }
      if (count >= MAX_FAILED_LOGINS) {
        lockedUntil = Date.now() + LOCKOUT_MS;
        count = 0;
      }
      await r.set(key, JSON.stringify({ count, lockedUntil }), 'PX', LOCKOUT_MS + 60 * 1000);
      if (lockedUntil > Date.now()) {
        return { locked: true, retryAfterMs: LOCKOUT_MS };
      }
      return { locked: false, retryAfterMs: 0 };
    } catch {
      // fall through
    }
  }

  const record = failedLogins.get(identifier);
  if (record && record.lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: record.lockedUntil - Date.now() };
  }
  let count = (record?.count || 0) + 1;
  let lockedUntil = 0;
  if (count >= MAX_FAILED_LOGINS) {
    lockedUntil = Date.now() + LOCKOUT_MS;
    count = 0;
  }
  failedLogins.set(identifier, { count, lockedUntil });
  if (lockedUntil > Date.now()) {
    return { locked: true, retryAfterMs: LOCKOUT_MS };
  }
  return { locked: false, retryAfterMs: 0 };
}

export async function clearFailedLogins(identifier: string): Promise<void> {
  const r = await getRedis();
  if (r) {
    try {
      await r.del(`lockout:${identifier}`);
    } catch {
      // ignore
    }
  }
  failedLogins.delete(identifier);
}
