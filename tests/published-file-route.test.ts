import { beforeEach, expect, it, vi } from 'vitest';
import { DocumentWriteError } from '@/lib/document-write';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/published-document-read', () => ({ readPublishedFile: mocks.read }));
import { GET } from '@/app/api/documents/[id]/publications/[snapshotId]/attachments/[attachmentId]/route';
const params = { params: Promise.resolve({ id: 'doc', snapshotId: 'snapshot', attachmentId: 'attachment' }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: 'reader' });
  mocks.read.mockResolvedValue({ bytes: Buffer.from('exact bytes'), filename: 'file.txt', mimeType: 'text/plain' });
});
it('requires authentication before reading storage', async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(new Request('http://localhost'), params)).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
});
it('returns bounded verified bytes with private download headers', async () => {
  const response = await GET(new Request('http://localhost'), params);
  expect(await response.text()).toBe('exact bytes');
  expect(response.headers.get('Content-Length')).toBe('11');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(mocks.read).toHaveBeenCalledWith('reader', 'doc', 'snapshot', 'attachment', expect.anything());
});
it('handles empty bytes and untrusted header metadata', async () => {
  mocks.read.mockResolvedValue({ bytes: Buffer.alloc(0), filename: 'bad"\r\n.txt', mimeType: 'text/plain\r\nInjected: true' });
  const response = await GET(new Request('http://localhost'), params);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Length')).toBe('0');
  expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="bad___.txt"');
});
it.each([404, 503])('preserves unavailable/denied status %s without returning bytes', async status => {
  mocks.read.mockRejectedValue(new DocumentWriteError(status, 'Unavailable'));
  const response = await GET(new Request('http://localhost'), params);
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: 'Unavailable' });
});
