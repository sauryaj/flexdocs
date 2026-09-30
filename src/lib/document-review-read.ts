import { Prisma, type DocumentReview } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { DocumentWriteError } from '@/lib/document-write';
import { publicationManifestSchema } from '@/lib/publication-manifest';
import type { ImmutableFileStore } from '@/lib/immutable-file-store';

export function documentReviewDto(review: DocumentReview) {
  const manifest = publicationManifestSchema.safeParse(review.attachmentManifest);
  if (!manifest.success) throw new DocumentWriteError(409, 'Invalid frozen review metadata');
  return { id: review.id, documentId: review.documentId, sourceRevisionId: review.sourceRevisionId, tags: review.tags,
    submittedById: review.submittedById, reviewerIds: review.reviewerIds, decision: review.decision,
    decidedById: review.decidedById, feedback: review.feedback, submittedAt: review.submittedAt, decidedAt: review.decidedAt,
    attachments: manifest.data.map(({ attachmentId, filename, mimeType, size }) => ({ attachmentId, filename, mimeType, size })) };
}

export async function readDocumentReviews(actorId: string, documentId: string, requestedPage = 0) {
  const page = Math.min(1_000_000, Math.max(0, Math.floor(requestedPage) || 0));
  const limit = 25;
  return prisma.$transaction(async tx => {
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor) throw new DocumentWriteError(404, 'Not found');
    const capabilities = await resolveDocumentCapabilities(document, actor, tx);
    if (!capabilities.readWorking) throw new DocumentWriteError(404, 'Not found');
    const reviews = await tx.documentReview.findMany({ where: { documentId }, include: { sourceRevision: {
      select: { title: true, content: true, category: true, version: true },
    } }, orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }], skip: page * limit, take: limit });
    const total = await tx.documentReview.count({ where: { documentId } });
    return { items: reviews.map(review => ({ ...documentReviewDto(review), sourceRevision: review.sourceRevision,
      canDecide: !document.isArchived && review.decision === 'pending' && capabilities.publish && review.reviewerIds.includes(actorId),
      canWithdraw: !document.isArchived && review.decision === 'pending' && capabilities.submitReview && review.submittedById === actorId,
      canPublish: !document.isArchived && review.decision === 'approved' && capabilities.publish,
    })), page, limit, total, hasMore: (page + 1) * limit < total,
      canSubmit: !!document.lifecycleState && ['draft', 'in_review'].includes(document.lifecycleState) && !document.isArchived && capabilities.submitReview };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readReviewedFile(actorId: string, documentId: string, reviewId: string, attachmentId: string, storage: ImmutableFileStore) {
  const authorize = () => prisma.$transaction(async tx => {
    const review = await tx.documentReview.findFirst({ where: { id: reviewId, documentId }, include: { document: true } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!review || !actor || !(await resolveDocumentCapabilities(review.document, actor, tx)).readWorking) throw new DocumentWriteError(404, 'Not found');
    const manifest = publicationManifestSchema.safeParse(review.attachmentManifest);
    if (!manifest.success) throw new DocumentWriteError(409, 'Invalid frozen review metadata');
    const file = manifest.data.find(item => item.attachmentId === attachmentId);
    if (!file) throw new DocumentWriteError(404, 'Not found');
    return file;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const file = await authorize();
  let bytes: Buffer;
  try { bytes = await storage.read(file); }
  catch { throw new DocumentWriteError(503, 'Reviewed attachment is unavailable'); }
  await authorize();
  return { filename: file.filename, mimeType: file.mimeType, bytes };
}
