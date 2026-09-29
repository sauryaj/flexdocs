export async function uploadDocumentAttachment(documentId: string, file: File, options: {
  signal?: AbortSignal; onProgress?: (percent: number) => void;
} = {}): Promise<void> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Maximum file size is 10 MiB. Select a smaller file.');
  if (options.signal?.aborted) throw new Error('Upload cancelled before sending.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const uncertain = 'Refresh attachments before retrying; the server may have saved the file.';
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    xhr.open('POST', '/api/attachments');
    xhr.timeout = 120_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) options.onProgress?.(Math.min(100, Math.round(event.loaded / event.total * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return finish();
      let message = 'The attachment could not be uploaded.';
      try { const data = JSON.parse(xhr.responseText); if (typeof data.error === 'string') message = data.error; } catch { /* Proxies may return non-JSON errors. */ }
      finish(new Error(`${message} ${uncertain}`));
    };
    xhr.onerror = () => finish(new Error(`Upload connection failed. ${uncertain}`));
    xhr.ontimeout = () => finish(new Error(`Upload timed out. ${uncertain}`));
    xhr.onabort = () => finish(new Error(`Upload cancelled. ${uncertain}`));
    const form = new FormData();
    form.set('documentId', documentId);
    form.set('file', file);
    options.signal?.addEventListener('abort', abort, { once: true });
    xhr.send(form);
  });
}

export async function moveDocument(id: string, folderId: string | null, expectedUpdatedAt: string): Promise<unknown> {
  const response = await fetch(`/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderId, expectedUpdatedAt }),
  });
  if (response.status === 409) {
    throw new Error('This document changed since the list loaded. Reload the page before moving it.');
  }
  if (!response.ok) throw new Error('Could not move the document. Please try again.');
  return response.json();
}
