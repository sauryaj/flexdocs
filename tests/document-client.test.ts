import { afterEach, expect, it, vi } from 'vitest';
import { moveDocument, uploadDocumentAttachment } from '@/lib/document-client';

afterEach(() => vi.unstubAllGlobals());

function stubFileReader(outcome: 'load' | 'error' | 'abort' = 'load') {
  vi.stubGlobal('FileReader', class {
    result = 'data:application/octet-stream;base64,aGVsbG8=';
    onload = () => {};
    onerror = () => {};
    onabort = () => {};
    readAsDataURL() { this[`on${outcome}`](); }
  });
}

it('uploads unknown file types with a fallback MIME type and the selected document', async () => {
  stubFileReader();
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 'attachment' }, { status: 201 }));
  vi.stubGlobal('fetch', fetch);
  await uploadDocumentAttachment('doc', new File(['hello'], 'notes.conf'));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    documentId: 'doc', filename: 'notes.conf', mimeType: 'application/octet-stream', size: 5, data: 'aGVsbG8=',
  });
});

it.each(['error', 'abort'] as const)('rejects file read %s without starting an upload', async outcome => {
  stubFileReader(outcome);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('retry');
  expect(fetch).not.toHaveBeenCalled();
});

it('reports the server upload rejection', async () => {
  stubFileReader();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Document not found' }, { status: 404 })));
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('Document not found');
});

it('reports non-JSON upload failures', async () => {
  stubFileReader();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('could not be uploaded');
});

it('settles an upload after a network rejection', async () => {
  stubFileReader();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
  await expect(uploadDocumentAttachment('doc', new File(['hello'], 'notes.txt'))).rejects.toThrow('Network unavailable');
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
