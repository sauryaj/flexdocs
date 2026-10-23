import { expect, it } from 'vitest';
import { documentCreateSchema, documentCreationHash, creationKeySchema } from '@/lib/document-create';

it('hashes equivalent creation requests identically, independent of tag order and optional defaults', () => {
  const a = documentCreateSchema.parse({ title: ' Document ', tags: ['b', 'a', 'a'] });
  const b = documentCreateSchema.parse({ title: 'Document', content: '', category: 'general', organizationId: null, folderId: null, reviewDate: null, visibility: 'private', tags: ['a', 'b'] });
  expect(documentCreationHash(a)).toBe(documentCreationHash(b));
});

it('binds a creation key to all persisted fields, preserving exact Markdown whitespace', () => {
  const initial = { title: 'Document', content: '# Exact\n', tags: ['one'] };
  for (const patch of [{ title: 'Other' }, { content: '# Exact\n\n' }, { tags: ['two'] }, { category: 'runbook' }, { folderId: 'folder' }, { organizationId: 'org' }, { reviewDate: '2026-10-01' }]) {
    expect(documentCreationHash({ ...initial, ...patch })).not.toBe(documentCreationHash(initial));
  }
  expect(documentCreationHash({ ...initial, organizationId: 'org', visibility: 'org' })).not.toBe(documentCreationHash({ ...initial, organizationId: 'org', visibility: 'private' }));
});

it('requires a bounded UUID request key', () => {
  expect(creationKeySchema.safeParse('23933672-7b0a-47e2-aebf-d3cf99627760').success).toBe(true);
  for (const value of ['', 'a'.repeat(1000), 'not-a-uuid']) expect(creationKeySchema.safeParse(value).success).toBe(false);
});
