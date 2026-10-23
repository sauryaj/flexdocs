import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
const change = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/documentation-grants', async importOriginal => ({ ...await importOriginal<object>(), changeDocumentationGrant: change, listDocumentationGrants: list }));
import { GET, PUT } from '@/app/api/organizations/[id]/documentation-grants/route';
import { DocumentationGrantError } from '@/lib/documentation-grants';
const context = { params: Promise.resolve({ id: 'org' }) };
const request = (body: unknown) => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ id: 'actor', role: 'admin' }); });
it.each([null, { id: 'actor', role: 'viewer' }])('denies mutation without write permission: %j', async actor => {
  auth.mockResolvedValue(actor);
  expect((await PUT(request({ userId: 'member', role: 'reader' }), context)).status).toBe(actor ? 403 : 401);
  expect(change).not.toHaveBeenCalled();
});
it.each([{ userId: 'member' }, { userId: 'member', role: 'unknown' }, { userId: 'member', role: 'reader', organizationId: 'foreign' }])('rejects malformed or extra fields: %j', async body => {
  expect((await PUT(request(body), context)).status).toBe(400);
  expect(change).not.toHaveBeenCalled();
});
it('passes explicit revocation to the audited service', async () => {
  change.mockResolvedValue(null);
  expect((await PUT(request({ userId: 'member', role: null }), context)).status).toBe(200);
  expect(change).toHaveBeenCalledWith('actor', 'org', 'member', null);
});
it('preserves service authorization and conflict statuses', async () => {
  for (const status of [403, 404, 409]) {
    change.mockRejectedValueOnce(new DocumentationGrantError(status, 'Denied'));
    expect((await PUT(request({ userId: 'member', role: 'reader' }), context)).status).toBe(status);
  }
});
it('uses the service for grant listing', async () => {
  list.mockResolvedValue([]);
  expect((await GET(request(null), context)).status).toBe(200);
  expect(list).toHaveBeenCalledWith('actor', 'org');
});
