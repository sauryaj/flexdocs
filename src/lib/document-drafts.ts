import { z } from 'zod';

export const DRAFT_PREFIX = 'flexdocs:draft:v1:';
export const DRAFT_EPOCH_KEY = 'flexdocs:draft:epoch';
export const DRAFT_CLEARED_EVENT = 'flexdocs:drafts-cleared';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const scopeSchema = z.object({ userId: z.string().min(1), organizationId: z.string().nullable(), documentId: z.string().min(1) });
export const draftFieldsSchema = z.object({
  title: z.string(), content: z.string(), category: z.string(), folderId: z.string(), organizationId: z.string(), tags: z.string(),
});
const draftSchema = scopeSchema.extend({
  instanceId: z.string().min(1), savedAt: z.number().finite(), expiresAt: z.number().finite(), fields: draftFieldsSchema,
});
export type DraftScope = z.infer<typeof scopeSchema>;
export type DraftFields = z.infer<typeof draftFieldsSchema>;
export type DocumentDraft = z.infer<typeof draftSchema>;

export function draftKey(scope: DraftScope, instanceId: string): string {
  return DRAFT_PREFIX + JSON.stringify([scope.userId, scope.organizationId, scope.documentId, instanceId]);
}

export function saveDraft(storage: Storage, scope: DraftScope, instanceId: string, fields: DraftFields, epoch: string | null, now = Date.now()): DocumentDraft {
  if (storage.getItem(DRAFT_EPOCH_KEY) !== epoch) throw new Error('Draft saving stopped because another tab signed out. Reload and sign in again.');
  const draft = draftSchema.parse({ ...scope, instanceId, fields, savedAt: now, expiresAt: now + DRAFT_TTL_MS });
  if ((scope.organizationId || '') !== fields.organizationId) throw new Error('Draft organization does not match its scope.');
  storage.setItem(draftKey(scope, instanceId), JSON.stringify(draft));
  return draft;
}

export function listDrafts(storage: Storage, scope: DraftScope, now = Date.now()): DocumentDraft[] {
  const drafts: DocumentDraft[] = [];
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (!key?.startsWith(DRAFT_PREFIX)) continue;
    let parsed;
    try { parsed = draftSchema.safeParse(JSON.parse(storage.getItem(key) || 'null')); } catch { continue; }
    if (!parsed.success) continue;
    const draft = parsed.data;
    if (draft.userId !== scope.userId || draft.organizationId !== scope.organizationId || draft.documentId !== scope.documentId) continue;
    if (key !== draftKey(draft, draft.instanceId) || (draft.organizationId || '') !== draft.fields.organizationId) continue;
    if (draft.expiresAt <= now || draft.savedAt > now || draft.expiresAt - draft.savedAt !== DRAFT_TTL_MS) {
      storage.removeItem(key);
      continue;
    }
    drafts.push(draft);
  }
  return drafts.sort((a, b) => b.savedAt - a.savedAt);
}

export function clearDocumentDrafts(storage: Storage, epoch: string): void {
  storage.setItem(DRAFT_EPOCH_KEY, epoch);
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith(DRAFT_PREFIX) || key === 'flexdocs_new_doc_draft') storage.removeItem(key);
}

export function clearBrowserDocumentDrafts(): void {
  window.dispatchEvent(new Event(DRAFT_CLEARED_EVENT));
  clearDocumentDrafts(window.localStorage, crypto.randomUUID());
}
