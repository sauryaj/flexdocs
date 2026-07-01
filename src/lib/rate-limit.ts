import { NextResponse } from 'next/server';
import Redis from 'ioredis';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis !== null) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    redis.connect().catch(() => { redis = null; });
    return redis;
  } catch {
    return null;
  }
}

// In-memory fallback
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const r = getRedis();

  if (r) {
    try {
      const redisKey = `ratelimit:${key}`;
      const now = Date.now();
      const ttl = await r.ttl(redisKey);

      if (ttl === -2) {
        // Key doesn't exist
        await r.set(redisKey, '1', 'PX', WINDOW_MS);
        return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: now + WINDOW_MS };
      }

      const count = await r.incr(redisKey);
      if (count === 1) {
        await r.pexpire(redisKey, WINDOW_MS);
      }

      if (count > MAX_ATTEMPTS) {
        const pttl = await r.pttl(redisKey);
        return { allowed: false, remaining: 0, resetAt: now + pttl };
      }

      const pttl = await r.pttl(redisKey);
      return { allowed: true, remaining: Math.max(0, MAX_ATTEMPTS - count), resetAt: now + pttl };
    } catch {
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, resetAt: now + WINDOW_MS };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  return { allowed: true, remaining: MAX_ATTEMPTS - record.count, resetAt: record.resetAt };
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
