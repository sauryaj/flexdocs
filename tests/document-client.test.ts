import { afterEach, expect, it, vi } from 'vitest';
import { moveDocument, uploadDocumentAttachment } from '@/lib/document-client';

afterEach(() => vi.unstubAllGlobals());

function stubUpload(outcome: 'load' | 'error' | 'abort' | 'timeout' = 'load', status = 201, responseText = '{}') {
  const send = vi.fn();
  vi.stubGlobal('XMLHttpRequest', class {
    status = status;
    responseText = responseText;
    upload = { onprogress: (_event: unknown) => {} };
    open() {}
    onload = () => {};
    onerror = () => {};
    onabort = () => {};
    ontimeout = () => {};
    send(body: FormData) { send(body); this.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 }); this[`on${outcome}`](); }
    abort() { this.onabort(); }
  });
  return send;
}

it('uploads unknown file types with a fallback MIME type and the selected document', async () => {
  const send = stubUpload();
  const onProgress = vi.fn();
  await uploadDocumentAttachment('doc', new File(['hello'], 'notes.conf'), { onProgress });
  const form = send.mock.calls[0][0] as FormData;
  expect(form.get('documentId')).toBe('doc');
  expect(await (form.get('file') as File).text()).toBe('hello');
  expect(onProgress).toHaveBeenCalledWith(50);
});

it.each(['error', 'abort', 'timeout'] as const)('reports uncertain upload outcome on %s', async outcome => {
  stubUpload(outcome);
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('Refresh attachments before retrying');
});

it('reports the server upload rejection', async () => {
  stubUpload('load', 404, JSON.stringify({ error: 'Document not found' }));
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('Document not found');
});

it('reports non-JSON upload failures', async () => {
  stubUpload('load', 502, 'Bad gateway');
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('could not be uploaded');
});

it('rejects oversized files and cancelled requests before sending', async () => {
  const send = stubUpload();
  await expect(uploadDocumentAttachment('doc', new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large'))).rejects.toThrow('10 MiB');
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'), { signal: AbortSignal.abort() })).rejects.toThrow('before sending');
  expect(send).not.toHaveBeenCalled();
});

it('moves only the folder and returns the server version without sending cached content', async () => {
  const updated = { id: 'doc', content: 'latest content', updatedAt: 'new-version' };
  const fetch = vi.fn().mockResolvedValue(Response.json(updated));
  vi.stubGlobal('fetch', fetch);
  expect(await moveDocument('doc', 'folder', 'old-version')).toEqual(updated);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ folderId: 'folder', expectedUpdatedAt: 'old-version' });
});

it('supports moving to the root folder', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'doc', folderId: null }));
  vi.stubGlobal('fetch', fetch);
  await moveDocument('doc', null, 'version');
  expect(JSON.parse(fetch.mock.calls[0][1].body).folderId).toBeNull();
});

it.each([403, 404, 500])('rejects failed moves with status %s', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'failure' }, { status })));
  await expect(moveDocument('doc', 'folder', 'version')).rejects.toThrow('Could not move');
});

it('explains how to recover from a stale move', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 409 })));
  await expect(moveDocument('doc', 'folder', 'version')).rejects.toThrow('Reload the page');
});

it('rejects network failures instead of reporting a successful move', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
  await expect(moveDocument('doc', 'folder', 'version')).rejects.toThrow('Network unavailable');
});
