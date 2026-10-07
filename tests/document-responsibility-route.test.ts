import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
const discover = vi.hoisted(() => vi.fn());
const reassign = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/document-responsibility', () => ({ discoverDocumentMaintainers: discover, reassignDocumentMaintainer: reassign }));
import { GET, PUT } from '@/app/api/documents/[id]/responsibility/route';
import { DocumentWriteError } from '@/lib/document-write';
const context = { params: Promise.resolve({ id: 'document' }) };
const version = '2026-10-01T00:00:00.000Z';
const request = (body: unknown) => new Request('http://localhost/api/documents/document/responsibility', { method: 'PUT', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ id: 'actor', role: 'admin' }); });
it.each([null, { id: 'viewer', role: 'viewer' }])('denies unauthorized callers %j', async actor => {
  auth.mockResolvedValue(actor);
  const status = actor ? 403 : 401;
  expect((await PUT(request({ responsibleUserId: 'target', expectedUpdatedAt: version }), context)).status).toBe(status);
  expect((await GET(request(null), context)).status).toBe(status);
  expect(reassign).not.toHaveBeenCalled();
  expect(discover).not.toHaveBeenCalled();
});
it.each([{ responsibleUserId: '' }, { responsibleUserId: 'target', organizationId: 'foreign' }, { expectedUpdatedAt: version },
  { responsibleUserId: 'target', expectedUpdatedAt: 'invalid' }])('rejects invalid input %j', async body => {
  expect((await PUT(request(body), context)).status).toBe(400);
  expect(reassign).not.toHaveBeenCalled();
});
it('bounds requests before calling the service', async () => {
  expect((await PUT(request({ responsibleUserId: 'a'.repeat(5000) }), context)).status).toBe(413);
  expect(reassign).not.toHaveBeenCalled();
});
it('passes explicit clearing and version to the service', async () => {
  reassign.mockResolvedValue({ responsibleUserId: null, audienceChanges: false });
  expect((await PUT(request({ responsibleUserId: null, expectedUpdatedAt: version }), context)).status).toBe(200);
  expect(reassign).toHaveBeenCalledWith('actor', 'document', null, version);
});
it('preserves service denial, conflict and precondition responses', async () => {
  for (const status of [400, 404, 409, 428]) {
    reassign.mockRejectedValueOnce(new DocumentWriteError(status, 'Denied'));
    expect((await PUT(request({ responsibleUserId: 'target', expectedUpdatedAt: version }), context)).status).toBe(status);
  }
});
it('does not expose internal errors or report an uncertain mutation as successful', async () => {
  reassign.mockRejectedValue(new Error('private connection details'));
  const response = await PUT(request({ responsibleUserId: 'target', expectedUpdatedAt: version }), context);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('private connection details');
});
it('lists only through current capability checks and disables shared caching', async () => {
  discover.mockResolvedValue({ items: [], audienceChanges: false });
  const response = await GET(new Request('http://localhost/responsibility?page=2&q=Alex'), context);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(discover).toHaveBeenCalledWith('actor', 'document', { page: 2, query: 'Alex' });
});
