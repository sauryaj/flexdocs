import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { storeFileBytes } from '@/lib/file-storage';

const files: string[] = [];
afterEach(() => { for (const path of files.splice(0)) rmSync(dirname(dirname(path)), { recursive: true, force: true }); });
function database() {
  const create = vi.fn().mockRejectedValue(new Error('database outcome unknown'));
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'editor' }) },
    document: { findFirst: vi.fn().mockResolvedValue({ id: 'personal' }) },
    attachment: { create },
  };
  Object.assign(prisma, { $transaction: (run: (client: typeof tx) => Promise<unknown>) => run(tx) });
  return create;
}
it('retains uploaded bytes when the database outcome is uncertain', async () => {
  database();
  const bytes = Buffer.from([0, 255, 11]);
  await expect(storeFileBytes(bytes, 'unknown.bin', 'application/octet-stream', randomUUID(), 'personal', {
    writeBytes: async (path, content) => { files.push(path); await writeFile(path, content); },
  })).rejects.toThrow('database outcome unknown');
  expect(readFileSync(files[0])).toEqual(bytes);
});
it('removes partial bytes when storage fails before the database write', async () => {
  const create = database();
  await expect(storeFileBytes(Buffer.from('full'), 'partial.bin', 'application/octet-stream', randomUUID(), 'personal', {
    writeBytes: async (path, content) => { files.push(path); await writeFile(path, content.subarray(0, 1)); throw new Error('storage full'); },
  })).rejects.toThrow('storage full');
  expect(create).not.toHaveBeenCalled();
  expect(existsSync(files[0])).toBe(false);
});
