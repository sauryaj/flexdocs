'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';

export function PublishedAttachments({ documentId, snapshotId, files }: {
  documentId: string; snapshotId: string;
  files: { attachmentId: string; filename: string; size: number }[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function download(file: typeof files[number]) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(file.attachmentId);
    setError('');
    try {
      const path = `/api/documents/${encodeURIComponent(documentId)}/publications/${encodeURIComponent(snapshotId)}/attachments/${encodeURIComponent(file.attachmentId)}`;
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) {
        setError(response.status === 503 ? 'Published file is unavailable. Try again or ask an administrator to check storage.' : 'Download unavailable. Refresh this document and try again.');
        return;
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!controller.signal.aborted) setError('Download failed. Try again.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  if (!files.length) return null;
  return <section className="card p-4 space-y-3" aria-labelledby="published-attachments-title">
    <h2 id="published-attachments-title" className="font-semibold">Published attachments</h2>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <ul className="space-y-2">{files.map(file => <li key={file.attachmentId} className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-all text-sm">{file.filename}</span>
      <button type="button" className="btn-secondary inline-flex items-center gap-2" disabled={pending !== null} onClick={() => download(file)} aria-label={`Download ${file.filename}`}>
        <Download className="w-4 h-4" aria-hidden="true" />{pending === file.attachmentId ? 'Downloading…' : 'Download'}
      </button>
    </li>)}</ul>
  </section>;
}
