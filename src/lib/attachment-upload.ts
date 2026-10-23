export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;

export class AttachmentUploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function parseLegacyAttachmentBody(request: Request): Promise<unknown> {
  const bytes = await readBoundedBody(request, 14_000_000 + 64 * 1024);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new AttachmentUploadError('Invalid attachment JSON', 400); }
}

export async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array> {
  const length = request.headers.get('content-length');
  if (length && Number(length) > limit) throw new AttachmentUploadError('Upload exceeds the request size limit', 413);
  if (!request.body) throw new AttachmentUploadError('Upload body is required', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new AttachmentUploadError('Upload exceeds the request size limit', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function parseMultipartAttachment(request: Request) {
  const bytes = await readBoundedBody(request, MAX_MULTIPART_BYTES);
  let form: FormData;
  try {
    form = await new Response(Buffer.from(bytes), { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
  } catch { throw new AttachmentUploadError('Invalid or interrupted multipart upload', 400); }
  const file = form.get('file');
  const documentId = form.get('documentId');
  if (!(file instanceof File) || form.getAll('file').length !== 1 || form.getAll('documentId').length > 1 ||
      (documentId !== null && (typeof documentId !== 'string' || documentId.length > 255)) ||
      !file.name || file.name.length > 255 || file.type.length > 255) {
    throw new AttachmentUploadError('Provide one file and an optional documentId', 400);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachmentUploadError('Maximum file size is 10 MiB', 413);
  return { filename: file.name, mimeType: file.type || 'application/octet-stream',
    documentId: typeof documentId === 'string' && documentId ? documentId : undefined,
    buffer: Buffer.from(await file.arrayBuffer()) };
}
