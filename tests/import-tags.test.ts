import { beforeEach, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { restoreBackup } from '@/lib/import';
import type { BackupBundle } from '@/lib/export';
import { requiredImportCollections } from '@/lib/import-preview';

const upsert = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(prisma.tag, { upsert });
  upsert.mockImplementation(async ({ create }: { create: { name: string } }) => ({ id: `tag-${create.name}` }));
  vi.mocked(prisma.document.create).mockResolvedValue({ id: 'doc' } as never);
  vi.mocked(prisma.document.update).mockResolvedValue({ id: 'doc' } as never);
});
function bundle(names: string[], declared = names): BackupBundle {
  return { schema: 'flexdocs-backup', version: 1,
    ...Object.fromEntries(requiredImportCollections.map(key => [key, []])),
    tags: declared, documents: [{ id: 'doc', title: 'Document', tagNames: names }],
  } as unknown as BackupBundle;
}

it('restores prototype-like tag names and deduplicates links', async () => {
  const report = await restoreBackup(bundle(['__proto__', 'constructor', '__proto__']), 'admin');
  expect(report.success).toBe(true);
  expect(prisma.document.update).toHaveBeenCalledWith({ where: { id: 'doc' }, data: { tags: { connect: [{ id: 'tag-__proto__' }, { id: 'tag-constructor' }] } } });
});
it('reports missing tag names without silently linking only the available subset', async () => {
  const report = await restoreBackup(bundle(['available', 'missing'], ['available']), 'admin');
  expect(report.success).toBe(false);
  expect(report.errors.join(' ')).toContain('names are unavailable');
  expect(prisma.document.update).not.toHaveBeenCalled();
});
it('reports tag link database failures without leaking provider diagnostics', async () => {
  vi.mocked(prisma.document.update).mockRejectedValue(new Error('sensitive database diagnostic'));
  const report = await restoreBackup(bundle(['tag']), 'admin');
  expect(report.success).toBe(false);
  expect(report.errors).toEqual(['document doc: tag links could not be restored']);
  expect(report.imported.documents).toBe(1);
});
it('reports a tag creation failure and preserves an explicit partial result', async () => {
  upsert.mockRejectedValue(new Error('database failure'));
  const report = await restoreBackup(bundle(['tag']), 'admin');
  expect(report.success).toBe(false);
  expect(report.errors).toHaveLength(2);
  expect(report.imported.documents).toBe(1);
});
