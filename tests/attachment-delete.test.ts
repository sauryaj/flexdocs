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
  const findFirst = vi.fn().mockResolvedValue({ id: 'file', storageType: 'filesystem', filePath: path });
  Object.assign(prisma, { attachment: { findFirst, deleteMany } });
  return { path, dir, deleteMany, findFirst };
}
it('preserves bytes when the database deletion fails', async () => {
  const f = fixture(); f.deleteMany.mockRejectedValue(new Error('database unavailable'));
  await expect(deleteFile('file', 'owner')).rejects.toThrow('database unavailable');
  expect(readFileSync(f.path, 'utf8')).toBe('preserve bytes');
});
it('does not remove bytes when guarded deletion no longer matches', async () => {
  const f = fixture(); f.deleteMany.mockResolvedValue({ count: 0 });
  expect(await deleteFile('file', 'owner')).toBeNull();
  expect(existsSync(f.path)).toBe(true);
});
it('removes bytes after database success and reports cleanup failures', async () => {
  const f = fixture();
  expect((await deleteFile('file', 'owner'))?.cleanupPending).toBe(false);
  expect(existsSync(f.path)).toBe(false);
  f.findFirst.mockResolvedValue({ id: 'file', storageType: 'filesystem', filePath: f.dir });
  expect((await deleteFile('file', 'owner'))?.cleanupPending).toBe(true);
  expect(existsSync(f.dir)).toBe(true);
});
