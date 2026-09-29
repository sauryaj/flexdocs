import { expect, it, vi } from 'vitest';
import { MAX_ATTACHMENT_BYTES, parseMultipartAttachment, readBoundedBody } from '@/lib/attachment-upload';

function upload(bytes: Uint8Array, type = '') {
  const form = new FormData();
  form.set('file', new File([Buffer.from(bytes)], 'file.bin', { type }));
  form.set('documentId', 'doc');
  return new Request('http://localhost/upload', { method: 'POST', body: form });
}
it('preserves arbitrary binary and empty files with unknown types', async () => {
  for (const bytes of [new Uint8Array([0, 255, 128]), new Uint8Array()]) {
    const result = await parseMultipartAttachment(upload(bytes));
    expect(result.buffer).toEqual(Buffer.from(bytes));
    expect(result.documentId).toBe('doc');
    expect(result.mimeType).toBe('application/octet-stream');
  }
});
it('enforces the actual streamed body limit without content-length', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6)); }, cancel });
  const request = new Request('http://localhost/upload', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  await expect(readBoundedBody(request, 5)).rejects.toMatchObject({ status: 413 });
  expect(cancel).toHaveBeenCalled();
});
it('rejects file bytes above the per-file limit', async () => {
  await expect(parseMultipartAttachment(upload(new Uint8Array(MAX_ATTACHMENT_BYTES + 1)))).rejects.toMatchObject({ status: 413 });
});
it('rejects truncated multipart bodies', async () => {
  await expect(parseMultipartAttachment(new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=missing' }, body: 'truncated' }))).rejects.toMatchObject({ status: 400 });
});
it('rejects ambiguous duplicate file fields', async () => {
  const form = new FormData();
  for (let i = 0; i < 2; i++) form.append('file', new File(['bytes'], 'file.txt'));
  await expect(parseMultipartAttachment(new Request('http://localhost/upload', { method: 'POST', body: form }))).rejects.toMatchObject({ status: 400 });
});
