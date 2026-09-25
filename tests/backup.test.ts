import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execFile: vi.fn(), statSync: vi.fn(), renameSync: vi.fn(), unlinkSync: vi.fn(), chmodSync: vi.fn(), readdirSync: vi.fn(), writeFileSync: vi.fn() }));
vi.mock('child_process', () => ({ execFile: mocks.execFile }));
vi.mock('fs', () => ({ ...mocks, mkdirSync: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { info: vi.fn(), error: vi.fn() } }));
import { createBackup, listBackups } from '@/lib/backup';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execFile.mockImplementation((_file, _args, _options, callback) => { callback(null); });
  process.env.DATABASE_URL = 'postgresql://user:p%24%28secret%29@localhost/db?sslmode=require';
  mocks.statSync.mockReturnValue({ size: 200, mtime: new Date(), mtimeMs: Date.now() });
  mocks.readdirSync.mockReturnValue([]);
});
it('passes a password-free connection URL and keeps the decoded password in the environment', async () => {
  const path = await createBackup();
  expect(mocks.execFile).toHaveBeenCalledWith('pg_dump', ['--dbname', 'postgresql://user@localhost/db?sslmode=require', '-F', 'p', '-f', `${path}.partial`], expect.objectContaining({ env: expect.objectContaining({ PGPASSWORD: 'p$(secret)'  }) }), expect.any(Function));
  expect(mocks.chmodSync).toHaveBeenCalledWith(`${path}.partial`, 0o600);
  expect(mocks.renameSync).toHaveBeenCalledWith(`${path}.partial`, path);
});
it('does not publish partial dumps after failure or expose provider errors', async () => {
  mocks.execFile.mockImplementationOnce(() => { throw new Error('sensitive provider diagnostic'); });
  await expect(createBackup()).rejects.toThrow('Database backup failed; no completed backup was published');
  expect(mocks.renameSync).not.toHaveBeenCalled();
  expect(mocks.unlinkSync).toHaveBeenCalled();
});
it('rejects an empty dump', async () => {
  mocks.statSync.mockReturnValue({ size: 0 });
  await expect(createBackup()).rejects.toThrow('Database backup failed');
  expect(mocks.renameSync).not.toHaveBeenCalled();
});
it('only lists completed SQL backups', async () => {
  mocks.readdirSync.mockReturnValue(['flexdocs-backup-2026-01-01T00-00-00-000Z.sql', 'flexdocs-backup-2026-01-01T00-00-00-000Z.sql.partial']);
  expect(listBackups()).toHaveLength(1);
});

it('removes Prisma-only options while retaining database TLS options', async () => {
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost/db?schema=public&sslmode=require&connection_limit=4';
  await createBackup();
  expect(mocks.execFile).toHaveBeenCalledWith('pg_dump', expect.arrayContaining(['--dbname', 'postgresql://user@localhost/db?sslmode=require']), expect.objectContaining({ env: expect.objectContaining({ PGPASSWORD: 'pass' }) }), expect.any(Function));
});

it('shares an in-flight backup without blocking callers or starting another process', async () => {
  let finish: (error: Error | null) => void = () => {};
  mocks.execFile.mockImplementationOnce((_file, _args, _options, callback) => { finish = callback; });
  const first = createBackup();
  const second = createBackup();
  expect(first).toBe(second);
  expect(mocks.execFile).toHaveBeenCalledTimes(1);
  expect(mocks.renameSync).not.toHaveBeenCalled();
  finish(null);
  await expect(first).resolves.toMatch(/\.sql$/);
});
