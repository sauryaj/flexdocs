import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encrypt } from '@/lib/encryption';
import { prisma } from '@/lib/prisma';

// Mock auth so we control the caller identity per test.
const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const auditMock = vi.fn();
vi.mock('@/lib/audit', () => ({
  auditLog: (...args: any[]) => auditMock(...args),
}));

describe('password list API (metadata-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/passwords/route');
    const res = await GET(new Request('http://localhost/api/passwords'));
    expect(res.status).toBe(401);
  });

  it('does not leak plaintext password or totp secret in the list', async () => {
    authMock.mockResolvedValue({ id: 'user1' });
    vi.mocked(prisma.password.findMany).mockResolvedValue([
      {
        id: 'pw1',
        name: 'GitHub',
        username: 'admin',
        password: encrypt('super-secret-value'),
        totpSecret: encrypt('JBSWY3DPEHPK3PXP'),
        category: 'general',
        organizationId: null,
        customFields: '[]',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      },
    ] as any);
    vi.mocked(prisma.password.count).mockResolvedValue(1);

    const { GET } = await import('@/app/api/passwords/route');
    const res = await GET(new Request('http://localhost/api/passwords'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    const item = body.items[0];
    // No plaintext anywhere
    expect(item.password).toBeUndefined();
    expect(item.totpSecret).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain('super-secret-value');
    expect(JSON.stringify(item)).not.toContain('JBSWY3DPEHPK3PXP');
    // Flags indicate presence without leaking the value
    expect(item.hasPassword).toBe(true);
    expect(item.hasTotp).toBe(true);
  });
});

describe('password reveal API (on-demand decryption)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/passwords/[id]/reveal/route');
    const res = await GET(new Request('http://localhost/api/passwords/pw1/reveal'), {
      params: Promise.resolve({ id: 'pw1' }),
    } as any);
    expect(res.status).toBe(401);
  });

  it('returns 404 when the password does not exist or is not owned', async () => {
    authMock.mockResolvedValue({ id: 'user1' });
    vi.mocked(prisma.password.findFirst).mockResolvedValue(null);
    const { GET } = await import('@/app/api/passwords/[id]/reveal/route');
    const res = await GET(new Request('http://localhost/api/passwords/nope/reveal'), {
      params: Promise.resolve({ id: 'nope' }),
    } as any);
    expect(res.status).toBe(404);
  });

  it('decrypts and returns the secret on demand, scoped to the owner', async () => {
    authMock.mockResolvedValue({ id: 'user1' });
    const stored = encrypt('Hunt3r2X!');
    vi.mocked(prisma.password.findFirst).mockResolvedValue({
      id: 'pw1',
      name: 'Test PW',
      username: 'admin',
      password: stored,
      totpSecret: encrypt('JBSWY3DPEHPK3PXP'),
      organizationId: 'org1',
    } as any);
    auditMock.mockResolvedValue(undefined);

    const { GET } = await import('@/app/api/passwords/[id]/reveal/route');
    const res = await GET(new Request('http://localhost/api/passwords/pw1/reveal'), {
      params: Promise.resolve({ id: 'pw1' }),
    } as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.password).toBe('Hunt3r2X!');
    expect(body.totpSecret).toBe('JBSWY3DPEHPK3PXP');
    // Owner scoping applied
    expect(prisma.password.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'pw1', userId: 'user1' }),
      })
    );
    // Audited
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'password.view', resourceId: 'pw1' })
    );
  });

  it('does not return the secret for another user (scope enforced)', async () => {
    authMock.mockResolvedValue({ id: 'user2' });
    vi.mocked(prisma.password.findFirst).mockResolvedValue(null); // not owned by user2
    const { GET } = await import('@/app/api/passwords/[id]/reveal/route');
    const res = await GET(new Request('http://localhost/api/passwords/pw1/reveal'), {
      params: Promise.resolve({ id: 'pw1' }),
    } as any);
    expect(res.status).toBe(404);
  });
});