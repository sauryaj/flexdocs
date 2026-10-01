import { Prisma } from '@prisma/client';
import { isAbsolute } from 'node:path';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';
import { type ImmutableFileStore } from '@/lib/immutable-file-store';
import { DocumentWriteError } from '@/lib/document-write';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';

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
    const bytes = await readWorkingAttachmentBytes(attachment, selection.uploadRoot);
    let reference;
    try { reference = await selection.storage.put(bytes); }
    catch { throw new DocumentWriteError(503, 'Unable to preserve reviewed attachment bytes; review was not submitted'); }
    manifest.push({ attachmentId: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, ...reference });
  }
  return manifest;
}
