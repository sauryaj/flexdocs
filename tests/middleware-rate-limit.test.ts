import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '@/middleware';

const counts = vi.hoisted(() => new Map<string, number>());
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async (key: string, limit: number) => {
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt: Date.now() + 900000 };
  },
  rateLimitResponse: () => NextResponse.json({ error: 'limited' }, { status: 429 }),
}));
beforeEach(() => counts.clear());
const request = (method: string, path = '/api/relationships', ip = 'test-client') => middleware(new NextRequest(`http://localhost${path}`, { method, headers: { 'x-forwarded-for': ip } }));

it('read exhaustion cannot consume the write budget or bypass either limit', async () => {
  for (let i = 0; i < 400; i++) expect((await request(i % 2 ? 'HEAD' : 'GET')).status).toBe(200);
  expect((await request('GET')).status).toBe(429);
  const firstWrite = await request('POST');
  expect(firstWrite.status).toBe(200);
  expect(firstWrite.headers.get('X-RateLimit-Remaining')).toBe('59');
  for (let i = 1; i < 60; i++) expect((await request(['POST', 'PUT', 'PATCH', 'DELETE'][i % 4])).status).toBe(200);
  expect((await request('POST')).status).toBe(429);
});
it('write exhaustion does not block reads; paths and clients are isolated', async () => {
  for (let i = 0; i < 60; i++) await request('POST');
  expect((await request('DELETE')).status).toBe(429);
  expect((await request('GET')).headers.get('X-RateLimit-Remaining')).toBe('399');
  expect((await request('POST', '/api/documents')).status).toBe(200);
  expect((await request('POST', '/api/relationships', 'other-client')).status).toBe(200);
});
it('leaves dedicated authentication limiters in charge of auth endpoints', async () => {
  for (const path of ['/api/login', '/api/login/verify-mfa', '/api/register']) await request('POST', path);
  expect(counts.size).toBe(0);
});
