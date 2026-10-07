import { expect, it } from 'vitest';
import { clearDocumentDrafts, DRAFT_EPOCH_KEY, DRAFT_TTL_MS, draftKey, listDrafts, saveDraft } from '@/lib/document-drafts';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); }, clear: () => values.clear(),
  };
}
const scope = { userId: 'alice', organizationId: 'org-a', documentId: 'new' };
const fields = { title: 'Draft', content: '# Exact Markdown\n\n```sh\necho ok\n```\n', category: 'general', folderId: '', organizationId: 'org-a', tags: 'one, two' };

it('preserves exact Markdown and metadata across recovery', () => {
  const store = storage();
  saveDraft(store, scope, 'tab-a', fields, null, 100);
  expect(listDrafts(store, scope, 101)[0].fields).toEqual(fields);
});

it.each([
  { ...scope, userId: 'bob' }, { ...scope, organizationId: 'org-b' }, { ...scope, documentId: 'existing-doc' },
])('never returns drafts outside the requested scope %j', other => {
  const store = storage();
  saveDraft(store, scope, 'tab-a', fields, null, 100);
  expect(listDrafts(store, other, 101)).toEqual([]);
});

it('keeps tab writes independent and orders recovery newest first', () => {
  const store = storage();
  saveDraft(store, scope, 'tab-a', fields, null, 100);
  saveDraft(store, scope, 'tab-b', { ...fields, title: 'Other tab' }, null, 101);
  expect(listDrafts(store, scope, 102).map(draft => draft.fields.title)).toEqual(['Other tab', 'Draft']);
});

it('expires drafts after seven days', () => {
  const store = storage();
  saveDraft(store, scope, 'tab-a', fields, null, 100);
  expect(listDrafts(store, scope, 100 + DRAFT_TTL_MS)).toEqual([]);
  expect(store.length).toBe(0);
});

it('does not associate legacy or malformed data with the signed-in account', () => {
  const store = storage();
  store.setItem('flexdocs_new_doc_draft', JSON.stringify(fields));
  store.setItem(draftKey(scope, 'bad'), '{');
  expect(listDrafts(store, scope)).toEqual([]);
});

it('rejects mismatched organization metadata', () => {
  expect(() => saveDraft(storage(), scope, 'tab-a', { ...fields, organizationId: 'org-b' }, null)).toThrow('scope');
});

it('clears drafts on sign-out without erasing unrelated browser preferences', () => {
  const store = storage();
  saveDraft(store, scope, 'tab-a', fields, null);
  store.setItem('flexdocs_new_doc_draft', JSON.stringify(fields));
  store.setItem('theme', 'dark');
  clearDocumentDrafts(store, 'logout-epoch');
  expect(listDrafts(store, scope)).toEqual([]);
  expect(store.getItem('flexdocs_new_doc_draft')).toBeNull();
  expect(store.getItem('theme')).toBe('dark');
  expect(store.getItem(DRAFT_EPOCH_KEY)).toBe('logout-epoch');
  expect(() => saveDraft(store, scope, 'old-tab', fields, null)).toThrow('signed out');
});

it('reports quota/storage failures rather than claiming persistence', () => {
  const store = storage();
  store.setItem = () => { throw new Error('Quota exceeded'); };
  expect(() => saveDraft(store, scope, 'tab-a', fields, null)).toThrow('Quota exceeded');
});

it('recovers existing-document metadata and its original server version without altering either', () => {
  const store = storage();
  const existing = { ...scope, documentId: 'document-a' };
  const edits = { ...fields, title: '', content: '', reviewDate: '2026-10-01', visibility: 'organization', baseUpdatedAt: '2026-09-25T00:00:00.000Z' };
  saveDraft(store, existing, 'tab-a', edits, null, 100);
  expect(listDrafts(store, existing, 101)[0].fields).toEqual(edits);
  expect(listDrafts(store, scope, 101)).toEqual([]);
});
