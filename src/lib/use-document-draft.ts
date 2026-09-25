'use client';

import { useEffect, useRef, useState } from 'react';
import { DRAFT_CLEARED_EVENT, DRAFT_EPOCH_KEY, draftKey, listDrafts, saveDraft, type DocumentDraft, type DraftFields } from './document-drafts';

export function useDocumentDraft(fields: DraftFields, enabled: boolean, documentId = 'new', recoveryEnabled = true) {
  const [userId, setUserId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DocumentDraft[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [revoked, setRevoked] = useState(false);
  const instanceId = useRef('');
  const epoch = useRef<string | null>(null);
  const active = useRef(true);
  const currentKey = useRef<string | null>(null);
  const serialized = JSON.stringify(fields);
  const organizationId = fields.organizationId || null;

  useEffect(() => {
    const controller = new AbortController();
    instanceId.current = crypto.randomUUID();
    const stop = () => {
      active.current = false;
      setRevoked(true);
      setCandidates([]);
      setSavedAt(null);
      setError('Draft saving stopped after sign-out. Reload and sign in before continuing.');
    };
    const onStorage = (event: StorageEvent) => { if (event.key === DRAFT_EPOCH_KEY || event.key === null) stop(); };
    window.addEventListener(DRAFT_CLEARED_EVENT, stop);
    window.addEventListener('storage', onStorage);
    fetch('/api/profile', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to identify your account. Draft recovery is unavailable until you reload.');
      const profile = await response.json();
      if (typeof profile?.id !== 'string') throw new Error('Unable to identify your account. Draft recovery is unavailable until you reload.');
      if (controller.signal.aborted || !active.current) return;
      try { epoch.current = localStorage.getItem(DRAFT_EPOCH_KEY); }
      catch { setError('Browser storage is unavailable. Keep this page open and save your document before leaving.'); }
      setUserId(profile.id);
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Draft recovery is unavailable.');
    });
    return () => {
      controller.abort();
      window.removeEventListener(DRAFT_CLEARED_EVENT, stop);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!userId || !active.current || !recoveryEnabled) return;
    try {
      setCandidates(listDrafts(localStorage, { userId, organizationId, documentId }).filter(draft => draft.instanceId !== instanceId.current));
    } catch {
      setError('Browser drafts could not be read. Keep this page open until your document is saved.');
    }
  }, [userId, organizationId, documentId, recoveryEnabled]);

  useEffect(() => {
    if (!userId || !enabled || !active.current) return;
    const data: DraftFields = JSON.parse(serialized);
    try {
      if (documentId === 'new' && !data.title && !data.content) {
        if (currentKey.current) localStorage.removeItem(currentKey.current);
        currentKey.current = null;
        setSavedAt(null);
        return;
      }
      const scope = { userId, organizationId, documentId };
      const draft = saveDraft(localStorage, scope, instanceId.current, data, epoch.current);
      const key = draftKey(scope, instanceId.current);
      if (currentKey.current && currentKey.current !== key) localStorage.removeItem(currentKey.current);
      currentKey.current = key;
      setSavedAt(draft.savedAt);
      setError('');
    } catch {
      setSavedAt(null);
      setError('Your latest changes could not be saved in this browser. Keep this page open and save the document before leaving.');
    }
  }, [userId, organizationId, documentId, serialized, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const onClick = (event: MouseEvent) => {
      if (savedAt && !error) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.href === window.location.href) return;
      if (!confirm('Your latest draft is not protected in this browser. Leave and risk losing your changes?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [enabled, fields.title, fields.content, savedAt, error]);

  const clear = () => {
    try {
      if (currentKey.current) localStorage.removeItem(currentKey.current);
      currentKey.current = null;
      setSavedAt(null);
      return true;
    } catch {
      setError('The browser draft could not be cleared. Your text has been kept.');
      return false;
    }
  };

  const discard = (draft: DocumentDraft) => {
    if (draft.userId !== userId || draft.organizationId !== organizationId || draft.documentId !== documentId) return;
    try {
      localStorage.removeItem(draftKey(draft, draft.instanceId));
      setCandidates(value => value.filter(item => item.instanceId !== draft.instanceId));
    } catch { setError('The saved draft could not be removed.'); }
  };

  return { candidates, savedAt, error, clear, discard, revoked };
}
