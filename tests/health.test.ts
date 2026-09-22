import { beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
const redis = vi.hoisted(() => ({ connect: vi.fn(), ping: vi.fn(), quit: vi.fn(), disconnect: vi.fn() }));
vi.mock('ioredis', () => ({ default: class { connect = redis.connect; ping = redis.ping; quit = redis.quit; disconnect = redis.disconnect; } }));
import { GET } from '@/app/api/health/route';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  redis.connect.mockResolvedValue(undefined);
  process.env.REDIS_URL = 'redis://localhost:6379';
});
it('reports healthy services with HTTP 200', async () => { expect((await GET()).status).toBe(200); });
it('makes database outages fail readiness without leaking connection errors', async () => {
  vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('sensitive connection details'));
  const response = await GET();
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain('sensitive connection details');
});
it('fails readiness and closes failed required Redis connections', async () => {
  redis.connect.mockRejectedValue(new Error('offline'));
  expect((await GET()).status).toBe(503);
  expect(redis.disconnect).toHaveBeenCalled();
});
