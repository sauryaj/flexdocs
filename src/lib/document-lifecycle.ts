import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { withdrawSupersededReviews } from '@/lib/document-history';
import { DocumentWriteError, nextDocumentTimestamp } from '@/lib/document-write';

export type LifecycleAction = 'archive' | 'unarchive' | 'trash' | 'restore';

export async function changeDocumentLifecycle(actorId: string, documentId: string, action: LifecycleAction, expectedUpdatedAt?: string) {
  if (!['archive', 'unarchive', 'trash', 'restore'].includes(action)) throw new DocumentWriteError(400, 'Invalid lifecycle action');
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
    const document = await tx.document.findUnique({ where: { id: documentId } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).manageLifecycle) throw new DocumentWriteError(404, 'Not found');
    const lifecycle = document.lifecycleState !== null;
    if (document.ownershipKind === 'organization' && !lifecycle) throw new DocumentWriteError(409, 'Team document must use the review lifecycle');
    if (lifecycle && !expectedUpdatedAt) throw new DocumentWriteError(428, 'Reload and provide the current document version');
    if (expectedUpdatedAt && expectedUpdatedAt !== document.updatedAt.toISOString()) throw new DocumentWriteError(409, 'Document changed; reload before changing its lifecycle');
    if (action === 'restore' ? !document.deletedAt : action !== 'trash' && document.deletedAt) throw new DocumentWriteError(409, 'Action is not valid for the current document state');
    if (action === 'unarchive' && !document.isArchived) throw new DocumentWriteError(409, 'Document is not archived');
    if ((action === 'trash' && document.deletedAt) || (action === 'archive' && document.isArchived)) return { document, changed: false };
    if (lifecycle) await withdrawSupersededReviews(tx, actorId, documentId, `lifecycle_${action}`);
    const updated = await tx.document.update({ where: { id: documentId }, data: {
      updatedAt: nextDocumentTimestamp(document),
      ...(action === 'archive' ? { isArchived: true, ...(lifecycle ? { lifecycleState: 'archived' as const } : {}) } : {}),
      ...(action === 'unarchive' ? { isArchived: false, ...(lifecycle ? { lifecycleState: 'draft' as const, publishedSnapshotId: null } : {}) } : {}),
      ...(action === 'trash' ? { deletedAt: new Date(), ...(lifecycle ? { lifecycleState: 'trashed' as const } : {}) } : {}),
      ...(action === 'restore' ? { deletedAt: null,
        ...(lifecycle ? { lifecycleState: document.isArchived ? 'archived' as const : 'draft' as const, publishedSnapshotId: null } : {}),
        ...(document.ownershipKind === 'personal' ? { visibility: 'private' } : {}),
      } : {}),
    } });
    await tx.activityLog.create({ data: { userId: actorId, action: `document.lifecycle.${action}`, resourceType: 'document', resourceId: documentId,
      details: JSON.stringify({ from: document.lifecycleState, to: updated.lifecycleState, publicationCleared: !!document.publishedSnapshotId && !updated.publishedSnapshotId }) } });
    return { document: updated, changed: true };
  });
}
