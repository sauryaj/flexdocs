import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import type { DocumentDiscoveryOptions } from '@/lib/document-discovery';

export async function discoverDocumentTrash(actorId: string, options: DocumentDiscoveryOptions) {
  const page = Math.min(1_000_000, Math.max(0, Math.floor(options.page) || 0));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit) || 50));
  const query = options.query?.trim() || '';
  if (query.length > 500) throw new DocumentWriteError(400, 'Search is limited to 500 characters');
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || !hasPermission(actor.role, 'document.read')) throw new DocumentWriteError(404, 'Not found');
    const scope = await getOrgScope(actor.id, actor.role, tx);
    const canManageTeam = hasPermission(actor.role, 'document.update') && hasPermission(actor.role, 'document.delete');
    const personal: Prisma.DocumentWhereInput = { ownershipKind: 'personal', userId: actor.id,
      ...(options.organizationId ? { organizationId: options.organizationId } : {}) };
    const team: Prisma.DocumentWhereInput = { ownershipKind: 'organization', lifecycleState: 'trashed',
      ...scopeOrgWhere(scope, options.organizationId), organization: {
        members: { some: { userId: actor.id } }, documentationGrants: { some: { userId: actor.id, role: 'administrator' } },
      } };
    const baseWhere: Prisma.DocumentWhereInput = { deletedAt: { not: null }, OR: canManageTeam ? [personal, team] : [personal] };
    const where: Prisma.DocumentWhereInput = { AND: [baseWhere, {
      ...(query ? { OR: [{ title: { contains: query, mode: 'insensitive' } }, { content: { contains: query, mode: 'insensitive' } }] } : {}),
      ...(options.category ? { category: options.category } : {}),
      ...(options.folderId ? { folderId: options.folderId } : {}),
      ...(options.excludeArchived ? { isArchived: false } : {}),
    }] };
    const documents = await tx.document.findMany({ where, select: { id: true, title: true, deletedAt: true, updatedAt: true,
      ownershipKind: true, lifecycleState: true, organizationId: true, isArchived: true, category: true },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }], skip: page * limit, take: limit });
    const total = await tx.document.count({ where });
    const totalAvailable = await tx.document.count({ where: baseWhere });
    return { items: documents.map(document => ({ ...document, canRestore: document.lifecycleState !== null
      ? hasPermission(actor.role, 'document.delete') : hasPermission(actor.role, 'document.update') })),
      total, totalAvailable, page, limit, hasMore: (page + 1) * limit < total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
