import { expect, it } from 'vitest';
import { ownershipPreflight } from '@/lib/ownership-preflight';
const folder = { id: 'folder', userId: 'owner', organizationId: 'org', parentId: null };
const doc = { id: 'doc', userId: 'owner', organizationId: 'org', folderId: 'folder', visibility: 'private', isArchived: false, deletedAt: null };

it('maps private/shared/archive/Trash in precedence order without changing records', () => {
  const docs = [doc, { ...doc, id: 'shared', visibility: 'org' }, { ...doc, id: 'archived', visibility: 'org', isArchived: true }, { ...doc, id: 'trashed', visibility: 'org', isArchived: true, deletedAt: new Date() }];
  const before = JSON.stringify(docs);
  expect(ownershipPreflight([folder], docs)).toMatchObject({ ready: true, lifecycleCounts: { draft: 1, published: 1, archived: 1, trashed: 1 } });
  expect(JSON.stringify(docs)).toBe(before);
});
it('rejects ambiguous sharing and owner/organization mismatch rather than repairing it', () => {
  const report = ownershipPreflight([folder], [{ ...doc, visibility: 'unexpected', userId: 'other' }, { ...doc, id: 'unassigned', visibility: 'org', organizationId: null }]);
  expect(report.ready).toBe(false);
  expect(report.errors.join(' ')).toContain('unknown visibility');
  expect(report.errors.join(' ')).toContain('another owner');
  expect(report.errors.join(' ')).toContain('no organization');
  expect(report.errors.join(' ')).toContain('another organization');
});
it('rejects folder cycles and cross-owner ancestry', () => {
  const report = ownershipPreflight([{ ...folder, parentId: 'other' }, { ...folder, id: 'other', userId: 'other', parentId: 'folder' }], [doc]);
  expect(report.ready).toBe(false);
  expect(report.errors.join(' ')).toContain('cycle');
  expect(report.errors.join(' ')).toContain('another owner');
});
