'use client';

import { useEffect, useRef, useState } from 'react';

export function DocumentLifecycleControls({ documentId, updatedAt, archived, blocked, onChanged }: {
  documentId: string; updatedAt: string; archived: boolean; blocked: boolean;
  onChanged: (action: 'archive' | 'unarchive' | 'trash') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  const change = async (action: 'archive' | 'unarchive' | 'trash') => {
    if (blocked || pending.current) return;
    const message = action === 'trash' ? 'Move this document to Trash? Readers will lose access. History and files are retained.'
      : action === 'archive' ? 'Archive this document? Readers will lose access. History and files are retained.'
      : 'Return this document to draft? This does not republish it for readers.';
    if (!window.confirm(message)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(`/api/documents/${documentId}/lifecycle`, { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedUpdatedAt: updatedAt }) });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Lifecycle change failed');
      onChanged(action);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof Error ? failure.message : 'Unable to confirm the change. Reload to check the current state before retrying.');
    } finally { pending.current = false; setBusy(false); }
  };

  return <section aria-label="Document lifecycle" className="rounded-lg border border-slate-200 p-3 space-y-2">
    <p className="text-sm text-slate-600">{archived ? 'Archived · Returning to draft does not republish.' : 'Archive or Trash removes reader access and retains history and files.'}</p>
    {blocked && <p className="text-sm">Save or resolve your edits before changing document status.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary" disabled={blocked || busy} onClick={() => void change(archived ? 'unarchive' : 'archive')}>{archived ? 'Return to draft' : 'Archive document'}</button>
      <button type="button" className="btn-secondary text-red-600" disabled={blocked || busy} onClick={() => void change('trash')}>Move to Trash</button>
    </div>
    {busy && <p role="status" className="text-sm">Changing document status…</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </section>;
}
