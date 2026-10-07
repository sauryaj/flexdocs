import { expect, it } from 'vitest';
import { validateImportTopology } from '@/lib/import-topology';

it('accepts unordered personal and organization folder trees', () => {
  expect(validateImportTopology([
    { id: 'child', parentId: 'root', organizationId: 'org' },
    { id: 'personal' }, { id: 'root', organizationId: 'org' },
  ], [{ id: 'doc', organizationId: 'org', folderId: 'child' }, { id: 'private', folderId: 'personal' }])).toEqual([]);
});

it.each([
  [[{ id: 'a', parentId: 'a' }], [], 'cycle'],
  [[{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }], [], 'cycle'],
  [[{ id: 'a', parentId: 'missing' }], [], 'missing'],
  [[{ id: 'a', organizationId: 'org' }, { id: 'b', parentId: 'a' }], [], 'another organization'],
  [[{ id: 'a', organizationId: 'org' }], [{ id: 'd', folderId: 'a' }], 'another organization'],
  [[], [{ id: 'd', folderId: 'missing' }], 'missing'],
  [[{ id: 'a' }, { id: 'a' }], [], 'Duplicate'],
  [[], [{ id: 'd' }, { id: 'd' }], 'Duplicate'],
  [[null], [], 'Invalid'],
])('rejects invalid graph %#', (folders, documents, message) => {
  expect(validateImportTopology(folders, documents).join(' ')).toContain(message);
});

it('validates deep trees without recursive stack overflow', () => {
  const folders = Array.from({ length: 12000 }, (_, i) => ({ id: String(i), parentId: i ? String(i - 1) : null }));
  expect(validateImportTopology(folders.reverse(), [])).toEqual([]);
});
