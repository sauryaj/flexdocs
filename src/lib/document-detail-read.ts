import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrgScope } from '@/lib/org-scope';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { readPublishedDocument } from '@/lib/published-document-read';
import { DocumentWriteError } from '@/lib/document-write';
import { hasPermission } from '@/lib/rbac';

export async function readDocumentDetail(actorId: string, documentId: string) {
  const selection = await prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    const record = await tx.document.findUnique({ where: { id: documentId }, include: { tags: true, folder: true, publishedSnapshot: true } });
    if (!actor || !hasPermission(actor.role, 'document.read') || !record || record.deletedAt) throw new DocumentWriteError(404, 'Not found');
    const { publishedSnapshot, ...document } = record;
    const capabilities = await resolveDocumentCapabilities({ ...document, hasPublishedSnapshot: !!publishedSnapshot }, actor, tx);
    if (capabilities.readWorking) return { document, published: false,
      canEdit: capabilities.edit && !(document.lifecycleState !== null && document.isArchived) && !(document.ownershipKind === 'organization' && document.lifecycleState === null),
      canRequestTransfer: capabilities.requestTransfer && !document.isArchived,
      canManageLifecycle: capabilities.manageLifecycle && !(document.ownershipKind === 'organization' && document.lifecycleState === null) };
    if (document.ownershipKind === 'organization') {
      if (!capabilities.readPublished) throw new DocumentWriteError(404, 'Not found');
      return { document: null, published: true, canEdit: false };
    }
    if (document.isArchived || document.visibility !== 'org' || !document.organizationId) throw new DocumentWriteError(404, 'Not found');
    const scope = await getOrgScope(actor.id, actor.role, tx);
    if (scope.mode !== 'all' && !scope.orgIds.includes(document.organizationId)) throw new DocumentWriteError(404, 'Not found');
    if (document.lifecycleState !== null) {
      if (!publishedSnapshot) throw new DocumentWriteError(404, 'Not found');
      return { document: null, published: true, canEdit: false };
    }
    return { document, published: false, canEdit: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!selection.published && selection.document) return { ...selection.document, canEdit: selection.canEdit,
    canRequestTransfer: selection.canRequestTransfer ?? false,
    canManageLifecycle: selection.canManageLifecycle ?? false, canDuplicate: selection.document.ownershipKind === 'personal' && selection.document.lifecycleState === null && selection.canEdit,
    representation: 'working' as const };
  const snapshot = await readPublishedDocument(actorId, documentId);
  return { id: snapshot.documentId, title: snapshot.title, content: snapshot.content, category: snapshot.category,
    organizationId: snapshot.organizationId, tags: snapshot.tags.map((name, index) => ({ id: `published-tag-${index}`, name })),
    folder: null, canEdit: false, representation: 'published' as const, snapshotId: snapshot.snapshotId,
    attachments: snapshot.attachments, createdAt: snapshot.publishedAt, updatedAt: snapshot.publishedAt };
}
