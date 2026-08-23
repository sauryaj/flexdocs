import { describe, it, expect, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: () => undefined })),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

import {
  createSessionToken,
  verifySessionToken,
  createSessionCookieValue,
} from '@/lib/session';

describe('session token signing', () => {
  it('creates a signed token of form <token>.<hmac>', () => {
    const signed = createSessionToken();
    expect(signed).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
  });

  it('verifies a freshly created token', () => {
    const signed = createSessionToken();
    expect(verifySessionToken(signed)).toBe(signed.split('.')[0]);
  });

  it('rejects a tampered signature', () => {
    const [token] = createSessionToken().split('.');
    const bad = `${token}.${'0'.repeat(64)}`;
    expect(verifySessionToken(bad)).toBeNull();
  });

  it('rejects a signature computed with a different secret', () => {
    const [token] = createSessionToken().split('.');
    const forged = `${token}.${require('crypto')
      .createHmac('sha256', 'wrong-secret')
      .update(token)
      .digest('hex')}`;
    expect(verifySessionToken(forged)).toBeNull();
  });

  it('rejects malformed values', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('no-dot-here')).toBeNull();
    expect(verifySessionToken('only.')).toBeNull();
  });

  it('produces the same cookie value as verify expects', () => {
    const token = 'abc123';
    const cookieValue = createSessionCookieValue(token);
    expect(cookieValue).toContain('.');
    expect(verifySessionToken(cookieValue)).toBe(token);
  });

  it('is deterministic for the same input token', () => {
    expect(createSessionCookieValue('tok')).toBe(createSessionCookieValue('tok'));
  });
});
