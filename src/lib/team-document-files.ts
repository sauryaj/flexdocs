import { Prisma, type Document } from '@prisma/client';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { withDocumentCapabilityWrite, withdrawSupersededReviews } from '@/lib/document-history';
import { DocumentWriteError, nextDocumentTimestamp } from '@/lib/document-write';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachment-upload';
import { LocalImmutableFileStore, PUBLICATION_OBJECT_DIRECTORY, isImmutableFileReference, type ImmutableFileStore } from '@/lib/immutable-file-store';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';

const metadata = { id: true, filename: true, mimeType: true, size: true, createdAt: true } as const;
const root = () => process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

async function authorize(tx: Prisma.TransactionClient, actorId: string, documentId: string) {
  const document = await tx.document.findFirst({ where: { id: documentId, ownershipKind: 'organization', deletedAt: null } });
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).readWorking) throw new DocumentWriteError(404, 'Not found');
  return document;
}

export async function listTeamDocumentFiles(actorId: string, documentId: string, requestedPage = 0) {
  const page = Math.min(1_000_000, Math.max(0, Math.floor(requestedPage) || 0));
  return prisma.$transaction(async tx => {
    await authorize(tx, actorId, documentId);
    const where = { documentId };
    const items = await tx.attachment.findMany({ where, select: metadata, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: page * 25, take: 25 });
    const total = await tx.attachment.count({ where });
    return { items, page, total, hasMore: (page + 1) * 25 < total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readTeamDocumentFile(actorId: string, documentId: string, attachmentId: string, options: {
  uploadRoot?: string; readBytes?: typeof readWorkingAttachmentBytes;
} = {}) {
  const attachment = await prisma.$transaction(async tx => {
    await authorize(tx, actorId, documentId);
    const file = await tx.attachment.findFirst({ where: { id: attachmentId, documentId } });
    if (!file) throw new DocumentWriteError(404, 'Not found');
    return file;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  let bytes: Buffer;
  try { bytes = await (options.readBytes || readWorkingAttachmentBytes)(attachment, options.uploadRoot || root()); }
  catch { throw new DocumentWriteError(503, 'Working file is unavailable; ask an administrator to check storage'); }
  await prisma.$transaction(async tx => {
    await authorize(tx, actorId, documentId);
    const current = await tx.attachment.findFirst({ where: { id: attachmentId, documentId } });
    if (!current || current.filePath !== attachment.filePath || current.data !== attachment.data || current.size !== attachment.size ||
      current.storageType !== attachment.storageType || current.filename !== attachment.filename || current.mimeType !== attachment.mimeType) throw new DocumentWriteError(404, 'Not found');
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { bytes, filename: attachment.filename, mimeType: attachment.mimeType };
}

async function advanceFiles(tx: Prisma.TransactionClient, actorId: string, document: Document, attachmentId: string, action: 'upload' | 'delete') {
  await withdrawSupersededReviews(tx, actorId, document.id, `attachment_${action}`);
  const updated = await tx.document.update({ where: { id: document.id }, data: { updatedAt: nextDocumentTimestamp(document), lifecycleState: 'draft' } });
  await tx.activityLog.create({ data: { userId: actorId, action: `document.attachment.${action}`, resourceType: 'document', resourceId: document.id, details: JSON.stringify({ attachmentId }) } });
  return updated.updatedAt;
}

function requireTeam(document: Document) {
  if (document.ownershipKind !== 'organization') throw new DocumentWriteError(404, 'Not found');
}

export async function uploadTeamDocumentFile(actorId: string, documentId: string, expectedUpdatedAt: string | undefined,
  input: { bytes: Buffer; filename: string; mimeType: string }, options: { uploadRoot?: string; storage?: ImmutableFileStore } = {}) {
  if (!input.filename || input.filename.length > 255 || !input.mimeType || input.mimeType.length > 255) throw new DocumentWriteError(400, 'Invalid file metadata');
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) throw new DocumentWriteError(413, 'Maximum file size is 10 MiB');
  const uploadRoot = options.uploadRoot || root();
  return withDocumentCapabilityWrite(actorId, documentId, expectedUpdatedAt, 'edit', async (tx, document) => {
    requireTeam(document);
    let reference;
    try { reference = await (options.storage || new LocalImmutableFileStore(uploadRoot)).put(input.bytes); }
    catch { throw new DocumentWriteError(503, 'Unable to preserve file bytes; upload was not committed'); }
    if (!isImmutableFileReference(reference)) throw new DocumentWriteError(503, 'Invalid file storage response');
    const attachment = await tx.attachment.create({ data: { documentId, userId: actorId, filename: input.filename, mimeType: input.mimeType,
      size: reference.size, storageType: 'filesystem', filePath: join(uploadRoot, PUBLICATION_OBJECT_DIRECTORY, reference.key) }, select: metadata });
    return { attachment, updatedAt: await advanceFiles(tx, actorId, document, attachment.id, 'upload') };
  });
}

export async function deleteTeamDocumentFile(actorId: string, documentId: string, attachmentId: string, expectedUpdatedAt?: string,
  options: { uploadRoot?: string; storage?: ImmutableFileStore } = {}) {
  return withDocumentCapabilityWrite(actorId, documentId, expectedUpdatedAt, 'edit', async (tx, document) => {
    requireTeam(document);
    const attachment = await tx.attachment.findFirst({ where: { id: attachmentId, documentId } });
    if (!attachment) throw new DocumentWriteError(404, 'Not found');
    const uploadRoot = options.uploadRoot || root();
    try {
      const bytes = await readWorkingAttachmentBytes(attachment, uploadRoot);
      await (options.storage || new LocalImmutableFileStore(uploadRoot)).put(bytes);
    } catch { throw new DocumentWriteError(503, 'Unable to preserve working bytes; file was not removed'); }
    await tx.attachment.delete({ where: { id: attachmentId } });
    // Reviewed/published copies may share immutable objects. Retain bytes for explicit reference-aware cleanup.
    return { success: true, bytesRetained: true, updatedAt: await advanceFiles(tx, actorId, document, attachmentId, 'delete') };
  });
}
