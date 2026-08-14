import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  checkRateLimit,
  rateLimitResponse,
  checkAccountLockout,
  recordFailedLogin,
  clearFailedLogins,
} from '@/lib/rate-limit';

// Tests rely on the in-memory fallback (REDIS_URL unset).
describe('rate limiting (in-memory)', () => {
  beforeEach(() => {
    // reset Redis env so tests always hit the in-memory path
    delete process.env.REDIS_URL;
  });

  it('allows requests within the limit', async () => {
    const r1 = await checkRateLimit('test:ip1', 10);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(9);
  });

  it('decrements remaining attempts', async () => {
    await checkRateLimit('test:ip2', 3);
    const r2 = await checkRateLimit('test:ip2', 3);
    const r3 = await checkRateLimit('test:ip2', 3);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
  });

  it('blocks when the limit is exceeded', async () => {
    const key = 'test:blocked';
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(key, 3);
    }
    const r = await checkRateLimit(key, 3);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('resets after the window expires', async () => {
    vi.useFakeTimers();
    try {
      const key = 'test:reset';
      const limit = 2;
      // exhaust the limit
      await checkRateLimit(key, limit);
      await checkRateLimit(key, limit);
      const blocked = await checkRateLimit(key, limit);
      expect(blocked.allowed).toBe(false);

      // advance beyond the 15-minute window
      vi.setSystemTime(Date.now() + 16 * 60 * 1000);
      const reset = await checkRateLimit(key, limit);
      expect(reset.allowed).toBe(true);
      expect(reset.remaining).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks keys independently', async () => {
    await checkRateLimit('test:a', 1);
    const b = await checkRateLimit('test:b', 1);
    expect(b.allowed).toBe(true);
  });

  it('returns a 429 response with Retry-After header', () => {
    const res = rateLimitResponse(Date.now() + 60_000);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
  });
});

describe('per-account login lockout (in-memory)', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    // clear the shared map state between tests
    clearFailedLogins('test:email:reset@example.com');
  });

  it('allows login when no failures recorded', async () => {
    const status = await checkAccountLockout('test:email:clean@example.com');
    expect(status.locked).toBe(false);
  });

  it('locks the account after MAX_FAILED_LOGINS attempts', async () => {
    const identifier = 'test:email:lockme@example.com';
    let status: { locked: boolean; retryAfterMs: number } | undefined;
    for (let i = 0; i < 5; i++) {
      status = await recordFailedLogin(identifier);
    }
    expect(status?.locked).toBe(true);
    expect(status?.retryAfterMs).toBeGreaterThan(0);

    const check = await checkAccountLockout(identifier);
    expect(check.locked).toBe(true);
  });

  it('does not lock before the threshold', async () => {
    const identifier = 'test:email:almost@example.com';
    for (let i = 0; i < 4; i++) {
      await recordFailedLogin(identifier);
    }
    const status = await checkAccountLockout(identifier);
    expect(status.locked).toBe(false);
  });

  it('clears failures after successful login', async () => {
    const identifier = 'test:email:clear@example.com';
    for (let i = 0; i < 4; i++) {
      await recordFailedLogin(identifier);
    }
    await clearFailedLogins(identifier);
    const status = await checkAccountLockout(identifier);
    expect(status.locked).toBe(false);
  });

  it('keeps lockout scoped per identifier', async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedLogin('test:email:one@example.com');
    }
    const other = await checkAccountLockout('test:email:two@example.com');
    expect(other.locked).toBe(false);
  });
});