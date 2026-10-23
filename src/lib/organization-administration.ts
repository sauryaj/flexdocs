import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { DocumentationGrantError, lockDocumentationAdministration } from '@/lib/documentation-grants';

export async function deleteOrganization(actorId: string, organizationId: string) {
  try {
    return await prisma.$transaction(async tx => {
      await lockDocumentationAdministration(tx);
      await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (!actor || !hasPermission(actor.role, 'organization.delete')) throw new DocumentationGrantError(403, 'Forbidden');
      if (!await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } })) throw new DocumentationGrantError(404, 'Not found');
      const teamDocuments = await tx.document.count({ where: { organizationId, ownershipKind: 'organization' } });
      const teamFolders = await tx.folder.count({ where: { organizationId, ownershipKind: 'organization' } });
      const requests = await tx.documentOwnershipRequest.count({ where: { destinationOrganizationId: organizationId } });
      if (teamDocuments || teamFolders || requests) throw new DocumentationGrantError(409, 'Organization has team documentation or retained ownership requests. Resolve transfers and retention before deletion.');
      await tx.document.updateMany({ where: { organizationId }, data: { organizationId: null, visibility: 'private' } });
      await tx.password.updateMany({ where: { organizationId }, data: { organizationId: null } });
      await tx.domain.updateMany({ where: { organizationId }, data: { organizationId: null } });
      await tx.flexibleAsset.updateMany({ where: { organizationId }, data: { organizationId: null } });
      await tx.checklist.updateMany({ where: { organizationId }, data: { organizationId: null } });
      await tx.folder.updateMany({ where: { organizationId }, data: { organizationId: null } });
      await tx.organization.delete({ where: { id: organizationId } });
      await tx.activityLog.create({ data: { userId: actorId, action: 'organization.delete', resourceType: 'organization', resourceId: organizationId,
        details: JSON.stringify({ personalDocumentsPreserved: true }) } });
      return { message: 'Deleted' };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new DocumentationGrantError(409, 'Organization still has referenced records. No associations were changed.');
    throw error;
  }
}
