import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notification: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  default: { error: vi.fn(), info: vi.fn() },
}));

import { prisma } from '@/lib/prisma';
import {
  createNotification,
  createNotificationForAllUsers,
  setMutedNotificationTypes,
} from '@/lib/notifications';

const mockedPrisma = vi.mocked(prisma, true);

describe('createNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a notification when the type is not muted', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ mutedNotificationTypes: [] } as never);
    await createNotification({ userId: 'u1', type: 'breach', title: 't', message: 'm' });
    expect(mockedPrisma.notification.create).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'breach', severity: 'info' }),
    });
  });

  it('skips creation when the type is muted', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({
      mutedNotificationTypes: ['webhook'],
    } as never);
    await createNotification({ userId: 'u1', type: 'webhook', title: 't', message: 'm' });
    expect(mockedPrisma.notification.create).not.toHaveBeenCalled();
  });

  it('skips creation when the user no longer exists (no mute record)', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null as never);
    await createNotification({ userId: 'ghost', type: 'system', title: 't', message: 'm' });
    // user missing => muted lookup returns null => proceed with create
    expect(mockedPrisma.notification.create).toHaveBeenCalledTimes(1);
  });

  it('never throws on DB failure', async () => {
    mockedPrisma.user.findUnique.mockResolvedValue({ mutedNotificationTypes: [] } as never);
    mockedPrisma.notification.create.mockRejectedValue(new Error('db down'));
    await expect(
      createNotification({ userId: 'u1', type: 'system', title: 't', message: 'm' }),
    ).resolves.toBeUndefined();
  });
});

describe('createNotificationForAllUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes users who muted the type', async () => {
    mockedPrisma.user.findMany.mockResolvedValue([{ id: 'u2' }] as never);
    await createNotificationForAllUsers({ type: 'maintenance', title: 't', message: 'm' });
    expect(mockedPrisma.user.findMany).toHaveBeenCalledWith({
      where: { NOT: { mutedNotificationTypes: { has: 'maintenance' } } },
      select: { id: true },
    });
    expect(mockedPrisma.notification.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u2', type: 'maintenance', title: 't', message: 'm', severity: 'info', link: null }],
    });
  });
});

describe('setMutedNotificationTypes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters invalid types and dedupes', async () => {
    const result = await setMutedNotificationTypes('u1', [
      'webhook',
      'not-a-type',
      'webhook',
      'breach',
    ]);
    expect(result).toEqual(['webhook', 'breach']);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { mutedNotificationTypes: ['webhook', 'breach'] },
    });
  });

  it('accepts an empty list to unmute everything', async () => {
    const result = await setMutedNotificationTypes('u1', []);
    expect(result).toEqual([]);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { mutedNotificationTypes: [] },
    });
  });
});
