import { z } from 'zod';
import { join } from 'node:path';
import { type Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { DocumentWriteError, nextDocumentTimestamp } from '@/lib/document-write';
import { previewDocumentOwnershipInTransaction } from '@/lib/document-ownership-preview';
import { ownershipRequestResult } from '@/lib/document-ownership-requests';
import { withdrawSupersededReviews } from '@/lib/document-history';
import { LocalImmutableFileStore, PUBLICATION_OBJECT_DIRECTORY } from '@/lib/immutable-file-store';
import { publicationManifestSchema } from '@/lib/publication-manifest';
import { readWorkingAttachmentBytes } from '@/lib/working-attachment-bytes';

export const ownershipConfirmationSchema = z.object({
  expectedUpdatedAt: z.string().datetime().transform(value => new Date(value).toISOString()),
  previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgeWorkingHistoryAndFilesExposure: z.literal(true),
}).strict();

async function preserveFiles(tx: Prisma.TransactionClient, documentId: string, root: string) {
  const storage = new LocalImmutableFileStore(root);
  const attachments = await tx.attachment.findMany({ where: { documentId }, orderBy: { id: 'asc' }, take: 201 });
  const reviews = await tx.documentReview.findMany({ where: { documentId }, select: { attachmentManifest: true } });
  const publications = await tx.documentPublication.findMany({ where: { documentId }, select: { attachmentManifest: true } });
  if (attachments.length > 200) throw new DocumentWriteError(413, 'Ownership changes currently support at most 200 working files');
  const historical = new Map<string, { key: string; sha256: string; size: number }>();
  for (const record of [...reviews, ...publications]) {
    const manifest = publicationManifestSchema.safeParse(record.attachmentManifest);
    if (!manifest.success) throw new DocumentWriteError(409, 'Invalid historical file metadata; ownership was not changed');
    for (const file of manifest.data) {
      const previous = historical.get(file.key);
      if (previous && previous.size !== file.size) throw new DocumentWriteError(409, 'Conflicting historical file metadata');
      historical.set(file.key, file);
    }
  }
  const total = attachments.reduce((sum, file) => sum + file.size, 0) + [...historical.values()].reduce((sum, file) => sum + file.size, 0);
  if (historical.size > 200 || total > 100 * 1024 * 1024) throw new DocumentWriteError(413, 'Ownership file verification exceeds the current 200 historical files / 100 MiB limit');
  for (const reference of historical.values()) {
    try { await storage.read(reference); }
    catch { throw new DocumentWriteError(503, 'Historical file bytes are unavailable or invalid; ownership was not changed'); }
  }
  for (const attachment of attachments) {
    try {
      const bytes = await readWorkingAttachmentBytes(attachment, root);
      const reference = await storage.put(bytes);
      await tx.attachment.update({ where: { id: attachment.id }, data: {
        storageType: 'filesystem', filePath: join(root, PUBLICATION_OBJECT_DIRECTORY, reference.key), data: null,
      } });
    } catch (error) {
      if (error instanceof DocumentWriteError) throw error;
      throw new DocumentWriteError(503, 'Working file bytes could not be preserved; ownership was not changed');
    }
  }
}

export async function confirmDocumentOwnershipRequest(actorId: string, requestId: string, input: unknown,
  options: { uploadRoot?: string } = {}) {
  const parsed = ownershipConfirmationSchema.safeParse(input);
  if (!parsed.success) throw new DocumentWriteError(400, 'Explicit ownership exposure acknowledgement and the original preview are required');
  const fields = parsed.data;
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor || !hasPermission(actor.role, 'document.update')) throw new DocumentWriteError(403, 'Forbidden');
    await tx.$queryRaw`SELECT "id" FROM "DocumentOwnershipRequest" WHERE "id" = ${requestId} AND "actorId" = ${actorId} FOR UPDATE`;
    const request = await tx.documentOwnershipRequest.findFirst({ where: { id: requestId, actorId } });
    if (!request) throw new DocumentWriteError(404, 'Not found');
    if (request.expectedUpdatedAt.toISOString() !== fields.expectedUpdatedAt || request.previewFingerprint !== fields.previewFingerprint) throw new DocumentWriteError(409, 'Confirmation must match the prepared preview');
    // Replaying an outcome discloses only the requester's recorded result, never current document contents.
    if (request.status === 'completed') return { request: ownershipRequestResult(request), replayed: true };
    if (request.status === 'cancelled') throw new DocumentWriteError(409, 'Ownership request was cancelled');
    if (request.expiresAt.getTime() <= Date.now()) throw new DocumentWriteError(409, 'Ownership request expired; review a new preview');
    if (!request.documentId) throw new DocumentWriteError(404, 'Document no longer available');
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${request.documentId} FOR UPDATE`;
    const preview = await previewDocumentOwnershipInTransaction(tx, actorId, request.documentId, request.destinationOrganizationId, fields.expectedUpdatedAt);
    if (preview.fingerprint !== fields.previewFingerprint || preview.blockers.length) throw new DocumentWriteError(409, 'Audience, files or document changed; review a new preview');
    const document = await tx.document.findUniqueOrThrow({ where: { id: request.documentId } });
    if (document.ownershipKind !== request.sourceOwnershipKind || document.userId !== request.sourceOwnerId || document.organizationId !== request.sourceOrganizationId) throw new DocumentWriteError(409, 'Source ownership changed');
    await preserveFiles(tx, document.id, options.uploadRoot || process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
    await withdrawSupersededReviews(tx, actorId, document.id, 'ownership_changed');
    const updated = await tx.document.update({ where: { id: document.id }, data: {
      ownershipKind: 'organization', organizationId: request.destinationOrganizationId, visibility: 'org',
      folderId: null, publishedSnapshotId: null, lifecycleState: 'draft', responsibleUserId: actorId,
      updatedAt: nextDocumentTimestamp(document),
    } });
    const completedAt = new Date();
    const completed = await tx.documentOwnershipRequest.update({ where: { id: requestId }, data: {
      status: 'completed', consentedAt: completedAt, completedAt, resultUpdatedAt: updated.updatedAt,
    } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.ownership.complete', resourceType: 'document', resourceId: document.id,
      details: JSON.stringify({ requestId, sourceOwnershipKind: request.sourceOwnershipKind, sourceOrganizationId: request.sourceOrganizationId,
        sourceOwnerId: request.sourceOwnerId, destinationOrganizationId: request.destinationOrganizationId, responsibleUserId: actorId,
        workingHistoryAndFilesExposureAcknowledged: true }) } });
    return { request: ownershipRequestResult(completed), replayed: false };
  }, { timeout: 30_000 });
}
