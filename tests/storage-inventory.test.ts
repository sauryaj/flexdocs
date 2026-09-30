import { expect, it } from 'vitest';
import { mkdtemp, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectAttachmentStorage } from '@/lib/storage-inventory';

it('reports missing and unreferenced files without following symlinks or changing bytes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'flexdocs-inventory-')));
  try {
    await writeFile(join(root, 'kept'), 'keep');
    await writeFile(join(root, 'orphan'), 'also keep');
    await symlink('/etc', join(root, 'external'));
    const report = await inspectAttachmentStorage(root, [
      { id: 'kept', filePath: join(root, 'kept') },
      { id: 'missing', filePath: join(root, 'absent') },
      { id: 'outside', filePath: '/outside-upload-root' },
      { id: 'null-path', filePath: null },
    ]);
    expect(report.scannedFiles).toBe(2);
    expect(report.missing).toEqual(['missing', 'null-path']);
    expect(report.outsideRoot).toEqual(['outside']);
    expect(report.skippedSymlinks).toEqual(['external']);
    expect(report.unreferenced).toEqual([{ path: 'orphan', olderThan24Hours: false }]);
    expect(await inspectAttachmentStorage(root, [])).toMatchObject({ scannedFiles: 2 });
  } finally { await rm(root, { recursive: true }); }
});

it('normalizes a configured root alias without following nested symlinks', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'flexdocs-inventory-alias-')));
  const root = join(parent, 'root');
  const alias = join(parent, 'alias');
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(root);
    await writeFile(join(root, 'kept'), 'keep');
    await symlink(root, alias);
    const report = await inspectAttachmentStorage(alias, [{ id: 'kept', filePath: join(alias, 'kept') }]);
    expect(report.missing).toEqual([]);
    expect(report.outsideRoot).toEqual([]);
    expect(report.unreferenced).toEqual([]);
  } finally { await rm(parent, { recursive: true }); }
});
