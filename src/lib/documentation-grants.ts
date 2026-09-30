import { Prisma, type DocumentationRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';

export class DocumentationGrantError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function changeDocumentationGrant(actorId: string, organizationId: string, targetId: string, role: DocumentationRole | null) {
  if (role !== null && !['reader', 'contributor', 'reviewer', 'administrator'].includes(role)) throw new DocumentationGrantError(400, 'Invalid documentation role');
  return prisma.$transaction(async tx => {
    // Serialize grant administration per organization, including concurrent last-admin removal.
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
    const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!organization) throw new DocumentationGrantError(404, 'Not found');
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join([...new Set([actorId, targetId])].sort())}) ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "OrganizationMember" WHERE "organizationId" = ${organizationId} AND "userId" IN (${Prisma.join([...new Set([actorId, targetId])].sort())}) ORDER BY "id" FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor) throw new DocumentationGrantError(403, 'Forbidden');
    const actorMembership = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } } });
    const actorGrant = await tx.organizationDocumentationGrant.findUnique({ where: { organizationId_userId: { organizationId, userId: actorId } } });
    if (actor.role !== 'admin' && !(actorMembership && actorGrant?.role === 'administrator' && hasPermission(actor.role, 'document.update'))) throw new DocumentationGrantError(403, 'Forbidden');
    const key = { organizationId_userId: { organizationId, userId: targetId } };
    const previous = await tx.organizationDocumentationGrant.findUnique({ where: key });
    if (role !== null) {
      const membership = await tx.organizationMember.findUnique({ where: key });
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { role: true } });
      if (!membership || !target) throw new DocumentationGrantError(400, 'Target must be a current organization member');
      if (role !== 'reader' && !hasPermission(target.role, 'document.update')) throw new DocumentationGrantError(400, 'Read-only accounts require the reader grant');
    }
    if (previous?.role === 'administrator' && role !== 'administrator') {
      const replacements = await tx.organizationDocumentationGrant.count({ where: {
        organizationId, role: 'administrator', userId: { not: targetId },
        user: { role: { in: ['admin', 'editor'] }, organizationMembers: { some: { organizationId } } },
      } });
      if (!replacements) throw new DocumentationGrantError(409, 'Assign another documentation administrator first');
    }
    if (previous?.role === role || (!previous && role === null)) return previous;
    const result = role === null
      ? (await tx.organizationDocumentationGrant.delete({ where: key }), null)
      : await tx.organizationDocumentationGrant.upsert({ where: key, create: { organizationId, userId: targetId, role }, update: { role } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'documentation.grant.change', resourceType: 'organization', resourceId: organizationId,
      details: JSON.stringify({ targetUserId: targetId, previousRole: previous?.role ?? null, role }) } });
    return result;
  });
}

export async function removeOrganizationMember(actorId: string, membershipId: string) {
  return prisma.$transaction(async tx => {
    const membership = await tx.organizationMember.findUnique({ where: { id: membershipId } });
    if (!membership) return;
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${membership.organizationId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join([...new Set([actorId, membership.userId])].sort())}) ORDER BY "id" FOR UPDATE`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
    if (!actor || !hasPermission(actor.role, 'user.manage')) throw new DocumentationGrantError(403, 'Forbidden');
    await tx.$queryRaw`SELECT "id" FROM "OrganizationMember" WHERE "id" = ${membershipId} FOR UPDATE`;
    const current = await tx.organizationMember.findUnique({ where: { id: membershipId } });
    if (!current) return;
    const grant = await tx.organizationDocumentationGrant.findUnique({ where: { organizationId_userId: { organizationId: current.organizationId, userId: current.userId } } });
    if (grant?.role === 'administrator') {
      const replacement = await tx.organizationDocumentationGrant.count({ where: {
        organizationId: current.organizationId, role: 'administrator', userId: { not: current.userId },
        user: { role: { in: ['admin', 'editor'] }, organizationMembers: { some: { organizationId: current.organizationId } } },
      } });
      if (!replacement) throw new DocumentationGrantError(409, 'Assign another documentation administrator first');
    }
    await tx.organizationDocumentationGrant.deleteMany({ where: { organizationId: current.organizationId, userId: current.userId } });
    await tx.document.updateMany({ where: { organizationId: current.organizationId, ownershipKind: 'organization', responsibleUserId: current.userId }, data: { responsibleUserId: null } });
    await tx.organizationMember.delete({ where: { id: membershipId } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'organization.member.remove', resourceType: 'organization', resourceId: current.organizationId,
      details: JSON.stringify({ targetUserId: current.userId, revokedDocumentationRole: grant?.role ?? null }) } });
  });
}
