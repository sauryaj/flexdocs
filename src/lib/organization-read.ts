import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import { documentDiscoverySql } from '@/lib/document-discovery';

export async function listVisibleOrganizations(actorId: string) {
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || !hasPermission(actor.role, 'organization.read')) throw new DocumentWriteError(403, 'Forbidden');
    const scope = await getOrgScope(actor.id, actor.role, tx);
    const organizationIds = scopeOrgWhere(scope).organizationId;
    const organizations = await tx.organization.findMany({
      where: organizationIds ? { id: organizationIds } : {},
      include: { _count: { select: {
        passwords: { where: scope.mode === 'limited' ? { clientVisible: true } : { userId: actorId } },
        domains: { where: scope.mode === 'limited' ? {} : { userId: actorId } },
        assets: { where: scope.mode === 'limited' ? {} : { userId: actorId } },
        checklists: { where: { userId: actorId } },
      } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    if (!organizations.length) return [];
    const counts = await tx.$queryRaw<{ organizationId: string; total: bigint }[]>(Prisma.sql`
      ${documentDiscoverySql(actor, scope, { page: 0, limit: 1 })}
      SELECT "organizationId", count(*) AS total FROM visible
      WHERE "organizationId" IN (${Prisma.join(organizations.map(organization => organization.id))})
      GROUP BY "organizationId"`);
    const documentCounts = new Map(counts.map(count => [count.organizationId, Number(count.total)]));
    return organizations.map(organization => ({ ...organization,
      _count: { ...organization._count, documents: documentCounts.get(organization.id) || 0 } }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function readVisibleOrganization(actorId: string, organizationId: string) {
  return prisma.$transaction(async tx => {
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor || !hasPermission(actor.role, 'organization.read')) throw new DocumentWriteError(403, 'Forbidden');
    const scope = await getOrgScope(actor.id, actor.role, tx);
    if (scope.mode === 'limited' && !scope.orgIds.includes(organizationId)) throw new DocumentWriteError(404, 'Not found');
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, include: {
      passwords: { where: scope.mode === 'limited' ? { clientVisible: true } : { userId: actorId },
        select: { id: true, name: true, username: true, updatedAt: true } },
      domains: { where: scope.mode === 'limited' ? {} : { userId: actorId },
        select: { id: true, name: true, expiresAt: true } },
      assets: { where: scope.mode === 'limited' ? {} : { userId: actorId },
        select: { id: true, name: true, assetType: true, updatedAt: true } },
      checklists: { where: { userId: actorId }, select: { id: true, name: true,
        items: { select: { id: true, text: true, isComplete: true } } } },
      contacts: true, locations: true,
    } });
    if (!organization) throw new DocumentWriteError(404, 'Not found');
    const documents = await tx.$queryRaw<{ id: string; title: string; category: string; updatedAt: Date }[]>(Prisma.sql`
      ${documentDiscoverySql(actor, scope, { organizationId, page: 0, limit: 1 })}
      SELECT id, title, category, "updatedAt" FROM visible ORDER BY "updatedAt" DESC, id ASC`);
    return { ...organization, documents, checklists: organization.checklists.map(checklist => ({
      ...checklist, items: checklist.items.map(item => ({ id: item.id, text: item.text, checked: item.isComplete })),
    })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
