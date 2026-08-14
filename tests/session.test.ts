import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createSessionToken,
  verifySessionToken,
  createSessionCookieValue,
  createSession,
  destroySession,
  sessionCookieOptions,
} from '@/lib/session';
import { prisma } from '@/lib/prisma';

describe('session tokens', () => {
  it('creates a token with a signature suffix', () => {
    const token = createSessionToken();
    const [t, sig] = token.split('.');
    expect(t).toBeTruthy();
    expect(sig).toBeTruthy();
    expect(token.split('.')).toHaveLength(2);
  });

  it('verifies a valid token', () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(token.split('.')[0]);
  });

  it('rejects a tampered signature', () => {
    const token = createSessionToken();
    const [t] = token.split('.');
    const tampered = `${t}.deadbeef`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('rejects a token with missing signature', () => {
    expect(verifySessionToken('rawtoken')).toBeNull();
  });

  it('rejects a token with a modified payload', () => {
    const token = createSessionToken();
    const [_, sig] = token.split('.');
    const tampered = `othertoken.${sig}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it('rejects empty input', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('   ')).toBeNull();
  });

  it('round-trips cookie value', () => {
    const token = createSessionToken();
    const raw = token.split('.')[0];
    const cookieValue = createSessionCookieValue(raw);
    expect(verifySessionToken(cookieValue)).toBe(raw);
  });
});

describe('session lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session and returns a signed cookie value', async () => {
    vi.mocked(prisma.session.count).mockResolvedValue(0);
    vi.mocked(prisma.session.create as any).mockImplementation(async ({ data }: any) => ({
      id: 'sess1',
      userId: data.userId,
      token: data.token,
      ip: data.ip,
      userAgent: data.userAgent,
      lastActive: new Date(),
      createdAt: new Date(),
    }));

    const { session, cookieValue } = await createSession('user1', '10.0.0.1', 'vitest');
    expect(session.id).toBe('sess1');
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user1', ip: '10.0.0.1', userAgent: 'vitest' }),
      })
    );
    // The random token is generated internally; the cookie must verify against it
    expect(cookieValue).toMatch(/^[0-9a-f]{64}\.[0-9a-f]{64}$/);
    expect(verifySessionToken(cookieValue)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('revokes oldest sessions when over the cap', async () => {
    vi.mocked(prisma.session.count).mockResolvedValue(12);
    vi.mocked(prisma.session.findMany).mockResolvedValue([{ id: 'old1' }, { id: 'old2' }, { id: 'old3' }] as any);
    vi.mocked(prisma.session.create).mockResolvedValue({
      id: 'sess-new',
      userId: 'user1',
      token: 'newtok',
      ip: null,
      userAgent: null,
      lastActive: new Date(),
      createdAt: new Date(),
    });

    await createSession('user1');
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old1', 'old2', 'old3'] } },
    });
  });

  it('destroys a session by cookie value', async () => {
    const token = createSessionToken();
    const raw = token.split('.')[0];
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 });
    await destroySession(createSessionCookieValue(raw));
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { token: raw } });
  });

  it('does nothing when destroying an invalid cookie', async () => {
    await destroySession('garbage.not-a-signature');
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });
});

describe('session cookie options', () => {
  it('returns secure cookies in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const opts = sessionCookieOptions();
      expect(opts.httpOnly).toBe(true);
      expect(opts.secure).toBe(true);
      expect(opts.sameSite).toBe('lax');
      expect(opts.path).toBe('/');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('returns non-secure cookies in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const opts = sessionCookieOptions();
      expect(opts.secure).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});