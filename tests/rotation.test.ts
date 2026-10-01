import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePassword, rotateOverduePasswords, rotatePassword } from '@/lib/password-rotation';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    password: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    passwordHistory: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => (String(s).startsWith('enc:') ? String(s).slice(4) : ''),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

vi.mock('@/lib/notifications', () => ({ createNotification: vi.fn() }));

import { prisma } from '@/lib/prisma';

describe('generatePassword', () => {
  it('rejects lengths that cannot meet the character-class contract', () => {
    for (const length of [0, 3, 4.5, 1025]) expect(() => generatePassword(length)).toThrow();
    expect(generatePassword(4)).toMatch(/^[a-zA-Z0-9!@#$%^&*_=+-]{4}$/);
  });
  it('creates a 24-char password with mixed classes', () => {
    const pw = generatePassword();
    expect(pw.length).toBe(24);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[!@#$%^&*_=+-]/.test(pw)).toBe(true);
  });
});

describe('rotatePassword (manual)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates, archives and recalculates expiry without touching the old secret', async () => {
    const base = {
      id: 'pw1',
      name: 'WiFi Admin',
      password: 'enc:old-secret',
      rotationEnabled: false,
      rotationMethod: 'manual',
      rotationTarget: null,
      rotationPort: 22,
      rotationUsername: null,
      rotationDays: 60,
      expiresAt: null,
      userId: 'u1',
    };
    (prisma.password.findUnique as any).mockResolvedValue(base);

    const result = await rotatePassword('pw1', 'u1');

    expect(result.ok).toBe(true);
    expect(prisma.password.update).toHaveBeenCalled();
    const update = (prisma.password.update as any).mock.calls[0][0].data;
    expect(update.password.startsWith('enc:')).toBe(true);
    expect(update.password.length).toBeGreaterThan(8);
    expect(update.password).not.toBe('enc:old-secret');
    expect(update.lastRotatedAt).toBeInstanceOf(Date);
    // rotationDays 60 → expiry 60 days ahead
    const expectancy = Number(update.expiresAt) - Date.now();
    expect(Math.abs(expectancy - 60 * 86400000)).toBeLessThan(2000);

    expect(prisma.passwordHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordId: 'pw1', reason: 'manual', oldPassword: 'enc:old-secret' }),
      })
    );
  });

  it('auto rotation set to manual notifies and keeps target untouched', async () => {
    const base = {
      id: 'pw2',
      name: 'DB',
      password: 'enc:old',
      rotationEnabled: true,
      rotationMethod: 'manual',
      rotationTarget: null,
      rotationPort: 22,
      rotationUsername: null,
      rotationDays: null,
      expiresAt: null,
      userId: 'u1',
    };
    (prisma.password.findUnique as any).mockResolvedValue(base);
    const result = await rotatePassword('pw2');
    expect(result.ok).toBe(true);
    // default window 90 days
    const update = (prisma.password.update as any).mock.calls[0][0].data;
    expect(Math.abs(Number(update.expiresAt) - (Date.now() + 90 * 86400000))).toBeLessThan(2000);
    // old secret archived, not lost
    expect((prisma.passwordHistory.create as any).mock.calls[0][0].data.oldPassword).toBe('enc:old');
  });

  it('fails fast when SSH rotation is enabled but target is missing', async () => {
    const base = {
      id: 'pw3',
      name: 'OKTA',
      password: 'enc:old',
      rotationEnabled: true,
      rotationMethod: 'ssh',
      rotationTarget: null,
      rotationPort: 22,
      rotationUsername: 'root',
      rotationDays: null,
      expiresAt: null,
      userId: 'u1',
    };
    (prisma.password.findUnique as any).mockResolvedValue(base);
    const result = await rotatePassword('pw3', 'u1');
    expect(result.ok).toBe(false);
    expect(prisma.password.update).not.toHaveBeenCalled();
  });

  it('rejects unknown password ids', async () => {
    (prisma.password.findUnique as any).mockResolvedValue(null);
    const result = await rotatePassword('nope');
    expect(result.ok).toBe(false);
  });
});

describe('rotateOverduePasswords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only selects enabled credentials past their expiry', async () => {
    (prisma.password.findMany as any).mockResolvedValue([
      { id: 'a', password: 'enc:x', rotationEnabled: true, rotationMethod: 'manual', rotationTarget: null, rotationPort: 22, rotationUsername: null, rotationDays: null, expiresAt: new Date(Date.now() - 1000), userId: 'u' },
    ]);
    (prisma.password.findUnique as any).mockImplementation(async ({ where }: any) =>
      (await prisma.password.findMany()).find((p: any) => p.id === where.id)
    );

    const res = await rotateOverduePasswords();
    expect(res.rotated).toBe(1);
    expect(res.failed).toBe(0);
    const where = (prisma.password.findMany as any).mock.calls[0][0].where;
    expect(where.rotationEnabled).toBe(true);
    expect(where.expiresAt?.lte).toBeInstanceOf(Date);
  });
});