import { expect, it } from 'vitest';
import { validateImportedDocuments } from '@/lib/import-documents';

const revision = { id: 'r', title: 'Earlier', content: 'Exact\n', category: 'general', version: 1 };
const document = { id: 'd', title: 'Current', content: '# Current\n', revisions: [revision], attachments: [{ filename: 'data.bin', mimeType: 'application/x-unknown', size: 3, data: 'AAEC' }] };

it('accepts exact Markdown, unknown MIME types and zero-byte files without changing the input', () => {
  const input = { ...document, attachments: [...document.attachments, { filename: 'empty', size: 0, data: '' }] };
  const original = structuredClone(input);
  expect(validateImportedDocuments([input])).toEqual([]);
  expect(input).toEqual(original);
});
it.each([
  { revisions: [null] }, { revisions: 'bad' }, { attachments: [null] },
  { tagNames: {} }, { reviewDate: 'not-a-date' }, { title: 42 },
  { attachments: [{ filename: 'bad', size: 3, data: '!!!!' }] },
  { attachments: [{ filename: 'bad', size: 4, data: 'AAEC' }] },
  { attachments: [{ filename: 'bad', size: 1, data: 'AB==' }] },
  { revisions: [{ ...revision, version: 1.5 }] },
  { revisions: [revision, { ...revision, id: 'second' }] },
])('rejects malformed nested content before restore: %j', fields => {
  expect(validateImportedDocuments([{ ...document, ...fields }]).length).toBeGreaterThan(0);
});
it('rejects revision IDs reused between documents', () => {
  expect(validateImportedDocuments([document, { ...document, id: 'second' }]).join(' ')).toContain('duplicate revision');
});
it('reports field locations without echoing document text or attachment bytes', () => {
  const errors = validateImportedDocuments([{ ...document, content: { secret: 'private body' } }]);
  expect(errors.join(' ')).toContain('documents[0].content');
  expect(errors.join(' ')).not.toContain('private body');
});
