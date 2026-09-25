import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const models = ['organization', 'document', 'password', 'domain', 'sslCertificate', 'flexibleAsset', 'flexibleAssetType', 'checklist', 'checklistItem', 'renewalItem', 'server', 'ipamNetwork', 'contact', 'location', 'website', 'ticket', 'ticketReply', 'relationship', 'folder', 'organizationMember'];
  return { prisma: Object.fromEntries(models.map(name => [name, { findMany: vi.fn() }])), decrypt: vi.fn(), existsSync: vi.fn(), readFileSync: vi.fn(), statSync: vi.fn() };
});
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/encryption', () => ({ decrypt: mocks.decrypt }));
vi.mock('fs', () => ({ existsSync: mocks.existsSync, readFileSync: mocks.readFileSync, statSync: mocks.statSync }));
import { buildBackup, ExportIncompleteError } from '@/lib/export';
beforeEach(() => {
  for (const model of Object.values(mocks.prisma)) model.findMany.mockReset().mockResolvedValue([]);
  mocks.decrypt.mockReset().mockImplementation(value => value);
  mocks.existsSync.mockReset().mockReturnValue(false);
  mocks.statSync.mockReset().mockReturnValue({ size: 10 });
  mocks.readFileSync.mockReset();
});
it('restricts organization queries and excludes cross-boundary relationships', async () => {
  mocks.prisma.document.findMany.mockResolvedValue([{ id: 'inside', tags: [], attachments: [], revisions: [] }]);
  mocks.prisma.password.findMany.mockResolvedValue([{ id: 'pw', password: 'secret', tags: [] }]);
  mocks.prisma.relationship.findMany.mockResolvedValue([
    { id: 'good', sourceType: 'document', sourceId: 'inside', targetType: 'password', targetId: 'pw' },
    { id: 'leak', sourceType: 'document', sourceId: 'inside', targetType: 'document', targetId: 'outside' },
  ]);
  const result = await buildBackup({ organizationId: 'org' });
  expect(mocks.prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org' } }));
  expect(mocks.prisma.folder.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org' } });
  expect(result.relationships).toHaveLength(1);
  expect(result.assetTypes).toEqual([]);
});
it('includes prior revisions and legacy inline attachment bytes', async () => {
  const revisions = [{ id: 'r', content: 'original', createdAt: new Date('2026-01-01') }];
  mocks.prisma.document.findMany.mockResolvedValue([{ id: 'd', tags: [], revisions, attachments: [{ id: 'a', filename: 'a.txt', storageType: 'base64', data: 'aGVsbG8=' }] }]);
  const result = await buildBackup();
  expect(result.documents).toEqual([expect.objectContaining({ revisions: [expect.objectContaining({ content: 'original' })], attachments: [expect.objectContaining({ data: 'aGVsbG8=' })] })]);
});
it('fails explicitly instead of exporting missing attachment bytes', async () => {
  mocks.prisma.document.findMany.mockResolvedValue([{ id: 'd', tags: [], revisions: [], attachments: [{ id: 'a', storageType: 'filesystem', filePath: '/missing' }] }]);
  await expect(buildBackup()).rejects.toBeInstanceOf(ExportIncompleteError);
});
it('does not substitute empty plaintext when a secret cannot be decrypted', async () => {
  mocks.prisma.password.findMany.mockResolvedValue([{ id: 'p', password: 'ciphertext', tags: [] }]);
  mocks.decrypt.mockImplementation(() => { throw new Error('provider diagnostic'); });
  await expect(buildBackup()).rejects.toMatchObject({ issues: ['Password p: decryption failed'] });
});

it('rejects oversized files before reading them into memory', async () => {
  mocks.prisma.document.findMany.mockResolvedValue([{ id: 'd', tags: [], revisions: [], attachments: [{ id: 'a', storageType: 'filesystem', filePath: '/large' }] }]);
  mocks.existsSync.mockReturnValue(true);
  mocks.statSync.mockReturnValue({ size: 15_000_000 });
  await expect(buildBackup()).rejects.toBeInstanceOf(ExportIncompleteError);
  expect(mocks.readFileSync).not.toHaveBeenCalled();
});

it('exports files above the old 8 MB cutoff without omitting their bytes', async () => {
  const bytes = Buffer.alloc(9 * 1024 * 1024, 'x');
  mocks.prisma.document.findMany.mockResolvedValue([{ id: 'd', tags: [], revisions: [], attachments: [{ id: 'a', storageType: 'filesystem', filePath: '/nine-mb' }] }]);
  mocks.existsSync.mockReturnValue(true);
  mocks.statSync.mockReturnValue({ size: bytes.length });
  mocks.readFileSync.mockReturnValue(bytes);
  const result = await buildBackup();
  expect(result.documents).toEqual([expect.objectContaining({ attachments: [expect.objectContaining({ data: bytes.toString('base64') })] })]);
});
