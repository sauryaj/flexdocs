import { vi } from 'vitest';

// Set test encryption key
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests';
process.env.SESSION_SECRET = 'test-session-secret-for-unit-tests';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    document: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    password: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    passwordHistory: { create: vi.fn(), findMany: vi.fn() },
    tag: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    domain: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    session: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    activityLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    $disconnect: vi.fn(),
  },
}));