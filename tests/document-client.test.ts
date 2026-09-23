import { afterEach, expect, it, vi } from 'vitest';
import { moveDocument } from '@/lib/document-client';

afterEach(() => vi.unstubAllGlobals());

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
