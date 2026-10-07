import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';
import { deleteFile } from '@/lib/file-storage';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'flexdocs-delete-')); dirs.push(dir);
  const path = join(dir, 'file'); writeFileSync(path, 'preserve bytes');
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const findFirst = vi.fn().mockResolvedValue({ id: 'file', storageType: 'filesystem', filePath: path, size: 14, documentId: null });
  const tx = { attachment: { findFirst, deleteMany, findUnique: vi.fn().mockResolvedValue({ documentId: null }) },
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'admin' }) }, $queryRaw: vi.fn().mockResolvedValue([]), activityLog: { create: vi.fn() } };
  Object.assign(prisma, { $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx) });
  return { path, dir, deleteMany, findFirst };
}
it('preserves bytes when the database deletion fails', async () => {
  const f = fixture(); f.deleteMany.mockRejectedValue(new Error('database unavailable'));
  await expect(deleteFile('file', 'owner', { uploadRoot: f.dir })).rejects.toThrow('database unavailable');
  expect(readFileSync(f.path, 'utf8')).toBe('preserve bytes');
});
it('does not remove bytes when guarded deletion no longer matches', async () => {
  const f = fixture(); f.deleteMany.mockResolvedValue({ count: 0 });
  expect(await deleteFile('file', 'owner', { uploadRoot: f.dir })).toBeNull();
  expect(existsSync(f.path)).toBe(true);
});
it('retains original and immutable bytes after database success', async () => {
  const f = fixture();
  const result = await deleteFile('file', 'owner', { uploadRoot: f.dir });
  expect(result).toMatchObject({ cleanupPending: true, bytesRetained: true });
  expect(readFileSync(f.path, 'utf8')).toBe('preserve bytes');
});
it('keeps the working record when bytes are unavailable', async () => {
  const f = fixture(); rmSync(f.path);
  await expect(deleteFile('file', 'owner', { uploadRoot: f.dir })).rejects.toMatchObject({ status: 503 });
  expect(f.deleteMany).not.toHaveBeenCalled();
});
