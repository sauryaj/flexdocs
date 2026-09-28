import { expect, it } from 'vitest';
import { previewBackup, requiredImportCollections } from '@/lib/import-preview';

const bundle = () => ({ schema: 'flexdocs-backup', version: 1, ...Object.fromEntries(requiredImportCollections.map(key => [key, []])) });

it('counts source records without claiming to predict database writes', () => {
  const preview = previewBackup({ ...bundle(), documents: [{ id: 'doc' }] });
  expect(preview.valid).toBe(true);
  expect(preview.counts.documents).toBe(1);
  expect(preview.warnings.join(' ')).toContain('not predicted new records');
});
it.each([null, [], {}, { ...bundle(), documents: [null] }, { ...bundle(), members: ['invalid'] }, { ...bundle(), servers: {} }])('rejects malformed bundles and collections: %j', value => {
  expect(previewBackup(value).valid).toBe(false);
});
it('uses the same topology validation as execution', () => {
  const preview = previewBackup({ ...bundle(), folders: [{ id: 'loop', parentId: 'loop' }] });
  expect(preview.valid).toBe(false);
  expect(preview.errors.join(' ')).toContain('cycle');
});
