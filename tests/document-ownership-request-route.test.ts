import { beforeEach, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
const read = vi.hoisted(() => vi.fn());
const cancel = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/lib/document-ownership-requests', () => ({ prepareDocumentOwnershipRequest: prepare, readDocumentOwnershipRequest: read, cancelDocumentOwnershipRequest: cancel }));
import { POST } from '@/app/api/documents/[id]/ownership/requests/route';
import { GET, DELETE } from '@/app/api/ownership-requests/[requestId]/route';
import { DocumentWriteError } from '@/lib/document-write';
const documentContext = { params: Promise.resolve({ id: 'document' }) };
const requestContext = { params: Promise.resolve({ requestId: 'request' }) };
const request = (body: unknown) => new Request('http://localhost/ownership/requests', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ id: 'actor', role: 'editor' }); });
it.each([null, { id: 'actor', role: 'viewer' }])('requires write permission to prepare %j', async actor => {
  auth.mockResolvedValue(actor);
  expect((await POST(request({}), documentContext)).status).toBe(actor ? 403 : 401);
  expect(prepare).not.toHaveBeenCalled();
});
it('rejects malformed and oversized bodies before the service', async () => {
  expect((await POST(new Request('http://localhost', { method: 'POST', body: '{' }), documentContext)).status).toBe(400);
  expect((await POST(request({ data: 'x'.repeat(5000) }), documentContext)).status).toBe(413);
  expect(prepare).not.toHaveBeenCalled();
});
it('distinguishes a committed new request from its durable replay', async () => {
  for (const replayed of [false, true]) {
    prepare.mockResolvedValue({ request: { id: 'request', status: 'pending' }, replayed });
    const response = await POST(request({ key: 'opaque' }), documentContext);
    expect(response.status).toBe(replayed ? 200 : 201);
    expect(response.headers.get('idempotency-replayed')).toBe(String(replayed));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  }
  expect(prepare).toHaveBeenCalledWith('actor', 'document', { key: 'opaque' });
});
it('preserves service preconditions and conflict status', async () => {
  for (const status of [400, 403, 404, 409, 428]) {
    prepare.mockRejectedValueOnce(new DocumentWriteError(status, 'Denied'));
    expect((await POST(request({}), documentContext)).status).toBe(status);
  }
});
it('permits downgraded requesters to read and cancel through requester-scoped services', async () => {
  auth.mockResolvedValue({ id: 'actor', role: 'viewer' });
  read.mockResolvedValue({ status: 'pending' }); cancel.mockResolvedValue({ status: 'cancelled' });
  expect((await GET(request(null), requestContext)).status).toBe(200);
  expect((await DELETE(request(null), requestContext)).status).toBe(200);
  expect(read).toHaveBeenCalledWith('actor', 'request'); expect(cancel).toHaveBeenCalledWith('actor', 'request');
});
it('requires authentication for status and cancellation', async () => {
  auth.mockResolvedValue(null);
  expect((await GET(request(null), requestContext)).status).toBe(401);
  expect((await DELETE(request(null), requestContext)).status).toBe(401);
  expect(read).not.toHaveBeenCalled(); expect(cancel).not.toHaveBeenCalled();
});
it('does not expose internal errors or claim uncertain writes succeeded', async () => {
  prepare.mockRejectedValue(new Error('PRIVATE INTERNAL DETAILS'));
  cancel.mockRejectedValue(new Error('PRIVATE INTERNAL DETAILS'));
  for (const response of [await POST(request({}), documentContext), await DELETE(request(null), requestContext)]) {
    expect(response.status).toBe(500); expect(await response.text()).not.toContain('PRIVATE INTERNAL DETAILS');
  }
});
