import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { DocumentWriteError } from '@/lib/document-write';

export async function discoverReviewFiles(actorId: string, documentId: string, requestedPage = 0) {
  const page = Math.min(1_000_000, Math.max(0, Math.floor(requestedPage) || 0));
  const limit = 25;
  return prisma.$transaction(async tx => {
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).submitReview) throw new DocumentWriteError(404, 'Not found');
    if (!document.lifecycleState || document.isArchived) throw new DocumentWriteError(409, 'Document must use the active review lifecycle');
    const where = { documentId, ...(document.ownershipKind === 'personal' ? { userId: actorId } : {}) };
    const items = await tx.attachment.findMany({ where, select: { id: true, filename: true, mimeType: true, size: true },
      orderBy: [{ filename: 'asc' }, { id: 'asc' }], skip: page * limit, take: limit });
    const total = await tx.attachment.count({ where });
    return { items, total, page, limit, hasMore: (page + 1) * limit < total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
