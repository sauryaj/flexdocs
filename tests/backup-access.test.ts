import { expect, it, vi } from 'vitest';
const authMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/backup', () => ({ listBackups: vi.fn().mockReturnValue([]), createBackup: vi.fn() }));

it.each([null, { id: 'u', role: 'viewer' }, { id: 'u', role: 'editor' }])('blocks database backup listing and download for %j', async user => {
  authMock.mockResolvedValue(user);
  const list = await import('@/app/api/backups/route');
  const download = await import('@/app/api/backups/[id]/download/route');
  expect((await list.GET()).status).toBe(user ? 403 : 401);
  expect((await download.GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'flexdocs-backup-2026.sql' }) })).status).toBe(user ? 403 : 401);
});
it('allows admin backup listing', async () => {
  authMock.mockResolvedValue({ id: 'u', role: 'admin' });
  const { GET } = await import('@/app/api/backups/route');
  expect((await GET()).status).toBe(200);
});
