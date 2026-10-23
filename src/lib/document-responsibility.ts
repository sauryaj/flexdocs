import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { withdrawSupersededReviews } from '@/lib/document-history';
import { DocumentWriteError, nextDocumentTimestamp } from '@/lib/document-write';

async function authorizedDocument(tx: Prisma.TransactionClient, actorId: string, documentId: string) {
  const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!document || document.ownershipKind !== 'organization' || !document.organizationId || !actor ||
      !(await resolveDocumentCapabilities(document, actor, tx)).requestTransfer) throw new DocumentWriteError(404, 'Not found');
  if (!document.lifecycleState) throw new DocumentWriteError(409, 'Team document must use the review lifecycle');
  return document;
}

function eligibleMaintainers(organizationId: string): Prisma.UserWhereInput {
  return {
    role: { in: Object.values(UserRole).filter(role => hasPermission(role, 'document.read') && hasPermission(role, 'document.update')) },
    organizationMembers: { some: { organizationId } },
    documentationGrants: { some: { organizationId, role: { in: ['contributor', 'reviewer', 'administrator'] } } },
  };
}

export async function discoverDocumentMaintainers(actorId: string, documentId: string, options: { page?: number; query?: string } = {}) {
  const query = options.query?.trim() || '';
  if (query.length > 200) throw new DocumentWriteError(400, 'Maintainer search is limited to 200 characters');
  const page = Number.isFinite(options.page) ? Math.min(1_000_000, Math.max(0, Math.floor(options.page!))) : 0;
  const limit = 25;
  return prisma.$transaction(async tx => {
    const document = await authorizedDocument(tx, actorId, documentId);
    const where: Prisma.UserWhereInput = { ...eligibleMaintainers(document.organizationId!),
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] } : {}),
    };
    const items = await tx.user.findMany({ where, select: { id: true, name: true, email: true },
      orderBy: [{ email: 'asc' }, { id: 'asc' }], skip: page * limit, take: limit });
    const total = await tx.user.count({ where });
    return { items, total, page, limit, hasMore: (page + 1) * limit < total,
      responsibleUserId: document.responsibleUserId, updatedAt: document.updatedAt, audienceChanges: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function reassignDocumentMaintainer(actorId: string, documentId: string, targetId: string | null, expectedUpdatedAt?: string) {
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
    const document = await authorizedDocument(tx, actorId, documentId);
    if (!expectedUpdatedAt) throw new DocumentWriteError(428, 'Reload and provide the current document version');
    if (document.updatedAt.toISOString() !== expectedUpdatedAt) throw new DocumentWriteError(409, 'Document changed; reload before reassigning responsibility');
    if (targetId !== null && !await tx.user.findFirst({ where: { id: targetId, ...eligibleMaintainers(document.organizationId!) }, select: { id: true } })) {
      throw new DocumentWriteError(400, 'Responsible maintainer must be a current team contributor, reviewer or administrator');
    }
    if (targetId === document.responsibleUserId) return { responsibleUserId: targetId, updatedAt: document.updatedAt, changed: false, audienceChanges: false };
    await withdrawSupersededReviews(tx, actorId, documentId, 'responsible_maintainer_changed');
    const updated = await tx.document.update({ where: { id: documentId }, data: {
      responsibleUserId: targetId, updatedAt: nextDocumentTimestamp(document),
      ...(document.lifecycleState === 'in_review' ? { lifecycleState: 'draft' } : {}),
    } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.responsibility.change', resourceType: 'document', resourceId: documentId,
      details: JSON.stringify({ previousUserId: document.responsibleUserId, responsibleUserId: targetId, audienceChanges: false }) } });
    return { responsibleUserId: updated.responsibleUserId, updatedAt: updated.updatedAt, changed: true, audienceChanges: false };
  });
}
