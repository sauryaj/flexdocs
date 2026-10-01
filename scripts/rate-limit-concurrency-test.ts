import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { checkRateLimit, recordFailedLogin, checkAccountLockout, clearFailedLogins } from '../src/lib/rate-limit';

async function main() {
  if (process.env.DOCUMENT_TEST_ISOLATED !== '1' || !process.env.REDIS_URL) throw new Error('Requires DOCUMENT_TEST_ISOLATED=1 and explicit disposable REDIS_URL');
  const redis = new Redis(process.env.REDIS_URL);
  const key = `concurrency-test:${randomUUID()}`;
  const account = `lockout-test:${randomUUID()}`;
  try {
    const responses = await Promise.all(Array.from({ length: 40 }, () => checkRateLimit(key, 10)));
    assert.equal(responses.filter(response => response.allowed).length, 10);
    assert.equal(await redis.get(`ratelimit:${key}`), '40');
    const ttl = await redis.pttl(`ratelimit:${key}`);
    assert.ok(ttl > 0 && ttl <= 900000);
    await redis.del(`ratelimit:${key}`);
    assert.equal((await checkRateLimit(key, 10)).remaining, 9);
    await redis.persist(`ratelimit:${key}`);
    assert.equal((await checkRateLimit(key, 10)).remaining, 8);
    assert.ok(await redis.pttl(`ratelimit:${key}`) > 0);
    console.log('PASS Redis concurrency limit, exact count, expiry, reset and missing-expiry repair');
    const attempts = await Promise.all(Array.from({ length: 20 }, () => recordFailedLogin(account)));
    assert.equal(attempts.filter(attempt => !attempt.locked).length, 4);
    assert.equal((await checkAccountLockout(account)).locked, true);
    const lockedRecord = await redis.get(`lockout:${account}`);
    await recordFailedLogin(account);
    assert.equal(await redis.get(`lockout:${account}`), lockedRecord);
    await clearFailedLogins(account);
    assert.equal((await checkAccountLockout(account)).locked, false);
    await redis.set(`lockout:${account}`, JSON.stringify({ count: 4, lockedUntil: 0 }), 'PX', 960000);
    assert.equal((await recordFailedLogin(account)).locked, true);
    await redis.set(`lockout:${account}`, JSON.stringify({ count: 0, lockedUntil: Date.now() - 1000 }), 'PX', 60000);
    assert.equal((await recordFailedLogin(account)).locked, false);
    console.log('PASS concurrent account lockout, stable lock duration, clearing, legacy records and expired locks');
  } finally { await redis.del(`ratelimit:${key}`, `lockout:${account}`); await redis.quit(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
