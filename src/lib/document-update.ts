import { type z } from 'zod';
import { documentUpdateSchema, DocumentWriteError, validateDocumentFolder, snapshotDocument, nextDocumentTimestamp } from '@/lib/document-write';
import { withDocumentCapabilityWrite, withdrawSupersededReviews } from '@/lib/document-history';

export async function updateDocument(actorId: string, documentId: string, input: z.infer<typeof documentUpdateSchema>) {
  const { expectedUpdatedAt, tags, reviewDate, reviewAcknowledged, ...fields } = documentUpdateSchema.parse(input);
  return withDocumentCapabilityWrite(actorId, documentId, expectedUpdatedAt, 'edit', async (tx, document) => {
    if (document.lifecycleState !== null && fields.isArchived !== undefined && fields.isArchived !== document.isArchived) throw new DocumentWriteError(409, 'Use a dedicated lifecycle action to archive this document');
    if (document.ownershipKind === 'organization') {
      if (fields.visibility !== undefined && fields.visibility !== document.visibility) throw new DocumentWriteError(400, 'Team reader access is controlled by documentation grants');
      if (fields.folderId) {
        const folder = await tx.folder.findFirst({ where: { id: fields.folderId, organizationId: document.organizationId, ownershipKind: 'organization' }, select: { id: true } });
        if (!folder) throw new DocumentWriteError(404, 'Team folder not found');
      }
    } else await validateDocumentFolder(tx, actorId, document.organizationId, fields.folderId);
    if ((fields.content !== undefined && fields.content !== document.content) || (fields.title !== undefined && fields.title !== document.title) || (fields.category !== undefined && fields.category !== document.category)) await snapshotDocument(tx, document, 'Saved before overwrite', actorId);
    if (document.lifecycleState !== null) await withdrawSupersededReviews(tx, actorId, documentId, 'working_copy_updated');
    const updated = await tx.document.update({ where: { id: documentId }, data: {
      ...fields, updatedAt: nextDocumentTimestamp(document),
      ...(document.lifecycleState !== null ? { lifecycleState: 'draft' } : {}),
      ...(fields.folderId !== undefined ? { folderId: fields.folderId || null } : {}),
      ...(fields.visibility !== undefined ? { visibility: fields.visibility === 'org' && document.organizationId ? 'org' : 'private' } : {}),
      ...(reviewDate !== undefined ? { reviewDate: reviewDate ? new Date(reviewDate) : null } : {}),
      ...(reviewAcknowledged ? { lastReviewedAt: new Date() } : {}),
      ...(tags !== undefined ? { tags: { set: [], connectOrCreate: tags.map(name => ({ where: { name_userId: { name, userId: actorId } }, create: { name, userId: actorId } })) } } : {}),
    }, include: { tags: true, folder: true } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.update', resourceType: 'document', resourceId: documentId, details: JSON.stringify({ fields: Object.keys(input).filter(key => key !== 'expectedUpdatedAt') }) } });
    return { ...updated, canEdit: true, canManageLifecycle: updated.ownershipKind === 'personal' && updated.lifecycleState === null,
      canDuplicate: updated.ownershipKind === 'personal' && updated.lifecycleState === null };
  });
}
