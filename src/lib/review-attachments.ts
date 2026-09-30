import { Prisma } from '@prisma/client';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';
import { type ImmutableFileStore } from '@/lib/immutable-file-store';
import { DocumentWriteError } from '@/lib/document-write';

export interface ReviewAttachmentSelection { attachmentIds: string[]; storage: ImmutableFileStore; uploadRoot: string }

export async function freezeReviewAttachments(tx: Prisma.TransactionClient, document: { id: string; ownershipKind: string }, actorId: string, selection?: ReviewAttachmentSelection) {
  if (!selection || !selection.attachmentIds.length) return [];
  const ids = [...new Set(selection.attachmentIds)].sort();
  if (ids.length > 10 || !isAbsolute(selection.uploadRoot)) throw new DocumentWriteError(400, 'Select at most ten files and configure an absolute upload root');
  await tx.$queryRaw`SELECT "id" FROM "Attachment" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  const attachments = await tx.attachment.findMany({ where: { id: { in: ids }, documentId: document.id, ...(document.ownershipKind === 'personal' ? { userId: actorId } : {}) }, orderBy: { id: 'asc' } });
  if (attachments.length !== ids.length) throw new DocumentWriteError(404, 'Selected attachment not found');
  if (attachments.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) throw new DocumentWriteError(413, 'Maximum review attachment total is 50 MiB');
  const manifest = [];
  for (const attachment of attachments) {
    if (attachment.size < 0 || attachment.size > MAX_ATTACHMENT_BYTES) throw new DocumentWriteError(413, 'Maximum review file size is 10 MiB');
    let bytes: Buffer;
    if (attachment.storageType === 'base64' && attachment.data !== null) {
      if (attachment.data.length > 14_000_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.data)) throw new DocumentWriteError(409, 'Invalid stored attachment encoding');
      bytes = Buffer.from(attachment.data, 'base64');
    } else if (attachment.storageType === 'filesystem' && attachment.filePath) {
      const root = await realpath(selection.uploadRoot);
      if ((await lstat(attachment.filePath)).isSymbolicLink()) throw new DocumentWriteError(409, 'Attachment symlinks cannot be published');
      const path = await realpath(attachment.filePath);
      const rel = relative(root, path);
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new DocumentWriteError(409, 'Attachment is outside the upload root');
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size !== attachment.size) throw new DocumentWriteError(409, 'Attachment size mismatch');
        const buffer = Buffer.alloc(attachment.size + 1);
        let length = 0;
        while (length < buffer.length) {
          const result = await file.read(buffer, length, buffer.length - length, null);
          if (!result.bytesRead) break;
          length += result.bytesRead;
        }
        bytes = buffer.subarray(0, length);
      } finally { await file.close(); }
    } else throw new DocumentWriteError(409, 'Attachment storage is unavailable');
    if (bytes.length !== attachment.size) throw new DocumentWriteError(409, 'Attachment size mismatch');
    let reference;
    try { reference = await selection.storage.put(bytes); }
    catch { throw new DocumentWriteError(503, 'Unable to preserve reviewed attachment bytes; review was not submitted'); }
    manifest.push({ attachmentId: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, ...reference });
  }
  return manifest;
}
