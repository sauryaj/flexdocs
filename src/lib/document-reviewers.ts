import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';

export async function discoverDocumentReviewers(actorId: string, documentId: string, options: { page?: number; query?: string } = {}) {
  const page = Math.min(1_000_000, Math.max(0, Math.floor(options.page ?? 0) || 0));
  const limit = 25;
  const query = options.query?.trim() || '';
  if (query.length > 200) throw new DocumentWriteError(400, 'Reviewer search is limited to 200 characters');
  return prisma.$transaction(async tx => {
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).submitReview) throw new DocumentWriteError(404, 'Not found');
    if (!document.lifecycleState || document.isArchived) throw new DocumentWriteError(409, 'Document must use the active review lifecycle');
    const roles = Object.values(UserRole).filter(role => hasPermission(role, 'document.read') && hasPermission(role, 'document.update'));
    const where: Prisma.UserWhereInput = { role: { in: roles },
      ...(document.ownershipKind === 'personal' ? { id: document.userId } : {
        organizationMembers: { some: { organizationId: document.organizationId! } },
        documentationGrants: { some: { organizationId: document.organizationId!, role: { in: ['reviewer', 'administrator'] } } },
      }),
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] } : {}),
    };
    const items = await tx.user.findMany({ where, select: { id: true, name: true, email: true }, orderBy: [{ email: 'asc' }, { id: 'asc' }], skip: page * limit, take: limit });
    const total = await tx.user.count({ where });
    return { items, total, page, limit, hasMore: (page + 1) * limit < total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
