import { prisma } from '@/lib/prisma';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { DocumentWriteError, nextDocumentTimestamp } from '@/lib/document-write';
import { type ImmutableFileStore } from '@/lib/immutable-file-store';
import { publicationManifestSchema, publicationTagsSchema } from '@/lib/publication-manifest';
import { isDeepStrictEqual } from 'node:util';

export async function publishDocumentReview(actorId: string, reviewId: string, storage: ImmutableFileStore, documentId?: string) {
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    const initial = await tx.documentReview.findUnique({ where: { id: reviewId }, select: { documentId: true } });
    if (!initial || (documentId && initial.documentId !== documentId)) throw new DocumentWriteError(404, 'Not found');
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${initial.documentId} FOR UPDATE`;
    const review = await tx.documentReview.findUniqueOrThrow({ where: { id: reviewId }, include: { document: true, sourceRevision: true } });
    const document = review.document;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || document.isArchived || !(await resolveDocumentCapabilities(document, actor, tx)).publish) throw new DocumentWriteError(404, 'Not found');
    if (review.decision !== 'approved') throw new DocumentWriteError(409, 'Approve the exact review before publication');
    const manifest = publicationManifestSchema.safeParse(review.attachmentManifest);
    const tags = publicationTagsSchema.safeParse(review.tags);
    if (!manifest.success || !tags.success) throw new DocumentWriteError(409, 'Invalid frozen review metadata');
    for (const reference of manifest.data) {
      try { await storage.read(reference); }
      catch { throw new DocumentWriteError(409, 'Reviewed attachment is missing or corrupt; restore it before publication'); }
    }
    const existing = await tx.documentPublication.findUnique({ where: { documentId_sourceRevisionId: { documentId: document.id, sourceRevisionId: review.sourceRevisionId } } });
    if (existing) {
      if (existing.title !== review.sourceRevision.title || existing.content !== review.sourceRevision.content || existing.category !== review.sourceRevision.category || !isDeepStrictEqual(existing.tags, review.tags) || !isDeepStrictEqual(existing.attachmentManifest, review.attachmentManifest)) throw new DocumentWriteError(409, 'Publication does not match the approved review');
      return { snapshot: existing, replayed: true };
    }
    const approver = review.decidedById ? await tx.user.findUnique({ where: { id: review.decidedById }, select: { id: true, role: true } }) : null;
    if (!approver || !review.reviewerIds.includes(approver.id) || !(await resolveDocumentCapabilities(document, approver, tx)).publish) throw new DocumentWriteError(409, 'Approver no longer has publication permission; submit a new review');
    if (document.lifecycleState !== 'in_review' || document.updatedAt.getTime() !== review.submittedAt.getTime() || document.title !== review.sourceRevision.title || document.content !== review.sourceRevision.content || document.category !== review.sourceRevision.category) throw new DocumentWriteError(409, 'Working document changed; submit a new review');
    const snapshot = await tx.documentPublication.create({ data: { documentId: document.id, sourceRevisionId: review.sourceRevisionId,
      title: review.sourceRevision.title, content: review.sourceRevision.content, category: review.sourceRevision.category,
      tags: tags.data, attachmentManifest: manifest.data, publisherId: actorId } });
    await tx.document.update({ where: { id: document.id }, data: { publishedSnapshotId: snapshot.id, lifecycleState: 'published', updatedAt: nextDocumentTimestamp(document) } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.publish', resourceType: 'document', resourceId: document.id,
      details: JSON.stringify({ reviewId, sourceRevisionId: review.sourceRevisionId, snapshotId: snapshot.id }) } });
    return { snapshot, replayed: false };
  }, { timeout: 30_000 });
}
