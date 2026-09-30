import { prisma } from '@/lib/prisma';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { DocumentWriteError, nextDocumentTimestamp } from '@/lib/document-write';
import { freezeReviewAttachments, type ReviewAttachmentSelection } from '@/lib/review-attachments';

export async function submitDocumentReview(actorId: string, documentId: string, expectedUpdatedAt: string, reviewerIds: string[], files?: ReviewAttachmentSelection) {
  const reviewers = [...new Set(reviewerIds)];
  if (!reviewers.length || reviewers.length > 10) throw new DocumentWriteError(400, 'Choose between one and ten reviewers');
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
    const document = await tx.document.findUnique({ where: { id: documentId }, include: { tags: { select: { name: true } } } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).submitReview) throw new DocumentWriteError(404, 'Not found');
    if (document.isArchived || !document.lifecycleState || !['draft', 'in_review'].includes(document.lifecycleState)) throw new DocumentWriteError(409, 'Document must use the draft review lifecycle');
    if (document.updatedAt.toISOString() !== expectedUpdatedAt) throw new DocumentWriteError(409, 'Document changed; reload before submitting for review');
    for (const reviewerId of reviewers) {
      const reviewer = await tx.user.findUnique({ where: { id: reviewerId }, select: { id: true, role: true } });
      if (!reviewer || !(await resolveDocumentCapabilities(document, reviewer, tx)).publish) throw new DocumentWriteError(400, 'Every reviewer must have current publication permission');
    }
    const pending = await tx.documentReview.findFirst({ where: { documentId, decision: 'pending' } });
    if (pending) throw new DocumentWriteError(409, 'Withdraw the current review before submitting another version');
    const attachmentManifest = await freezeReviewAttachments(tx, document, actorId, files);
    const previous = await tx.documentRevision.findFirst({ where: { documentId }, orderBy: { version: 'desc' } });
    const revision = await tx.documentRevision.create({ data: { documentId, userId: actorId, title: document.title, content: document.content, category: document.category, version: (previous?.version ?? 0) + 1, message: 'Submitted for review' } });
    const submittedAt = nextDocumentTimestamp(document);
    const review = await tx.documentReview.create({ data: { documentId, sourceRevisionId: revision.id, submittedById: actorId, reviewerIds: reviewers, submittedAt, tags: document.tags.map(tag => tag.name).sort(), attachmentManifest } });
    await tx.document.update({ where: { id: documentId }, data: { lifecycleState: 'in_review', updatedAt: submittedAt } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.review.submit', resourceType: 'document', resourceId: documentId, details: JSON.stringify({ reviewId: review.id, sourceRevisionId: revision.id, reviewerIds: reviewers }) } });
    return review;
  }, { timeout: 30_000 });
}

export async function decideDocumentReview(actorId: string, reviewId: string, decision: 'approved' | 'rejected' | 'withdrawn', feedback?: string) {
  if (!['approved', 'rejected', 'withdrawn'].includes(decision) || (feedback && feedback.length > 10_000)) throw new DocumentWriteError(400, 'Invalid review decision');
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    const initial = await tx.documentReview.findUnique({ where: { id: reviewId }, select: { documentId: true } });
    if (!initial) throw new DocumentWriteError(404, 'Not found');
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${initial.documentId} FOR UPDATE`;
    const review = await tx.documentReview.findUniqueOrThrow({ where: { id: reviewId }, include: { sourceRevision: true, document: true } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || review.document.isArchived || review.document.deletedAt) throw new DocumentWriteError(404, 'Not found');
    const capabilities = await resolveDocumentCapabilities(review.document, actor, tx);
    if (decision === 'withdrawn' ? !(review.submittedById === actorId && capabilities.submitReview) : !(review.reviewerIds.includes(actorId) && capabilities.publish)) throw new DocumentWriteError(404, 'Not found');
    if (review.decision !== 'pending') {
      if (review.decision === decision && review.decidedById === actorId && (review.feedback ?? '') === (feedback ?? '')) return review;
      throw new DocumentWriteError(409, 'Review already decided');
    }
    if (decision !== 'withdrawn' && (review.document.lifecycleState !== 'in_review' || review.document.updatedAt.getTime() !== review.submittedAt.getTime() ||
      review.document.title !== review.sourceRevision.title || review.document.content !== review.sourceRevision.content || review.document.category !== review.sourceRevision.category)) throw new DocumentWriteError(409, 'Working document changed; withdraw and submit a new review');
    const updated = await tx.documentReview.update({ where: { id: reviewId }, data: { decision, feedback: feedback || null, decidedById: actorId, decidedAt: new Date() } });
    if (decision !== 'approved') await tx.document.update({ where: { id: review.documentId }, data: { lifecycleState: 'draft', updatedAt: nextDocumentTimestamp(review.document) } });
    await tx.activityLog.create({ data: { userId: actorId, action: `document.review.${decision}`, resourceType: 'document', resourceId: review.documentId, details: JSON.stringify({ reviewId, sourceRevisionId: review.sourceRevisionId }) } });
    return updated;
  });
}
