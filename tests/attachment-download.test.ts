import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';
import { getAttachmentData } from '@/lib/file-storage';

const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'flexdocs-download-'));
  directories.push(dir);
  return join(dir, 'file');
}
function record(filePath: string) {
  Object.assign(prisma, { attachment: { findFirst: vi.fn().mockResolvedValue({ id: 'attachment', storageType: 'filesystem', filePath, data: null }) } });
}
it('reads exact binary bytes and preserves valid empty files', async () => {
  const path = fixture();
  record(path);
  for (const bytes of [Buffer.from([0, 255, 128, 10]), Buffer.alloc(0)]) {
    writeFileSync(path, bytes);
    expect((await getAttachmentData('attachment', 'owner'))?.data).toBe(bytes.toString('base64'));
  }
});
it('returns missing for absent stored files without deleting the record', async () => {
  record(fixture());
  expect(await getAttachmentData('attachment', 'owner')).toBeNull();
});
it('does not misreport other storage failures as missing files', async () => {
  const path = fixture();
  record(join(path, '..'));
  await expect(getAttachmentData('attachment', 'owner')).rejects.toMatchObject({ code: 'EISDIR' });
});
