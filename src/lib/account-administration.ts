import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { DocumentationGrantError, lockDocumentationAdministration } from '@/lib/documentation-grants';

export async function administerAccount(actorId: string, targetId: string, role: UserRole | null) {
  if (role !== null && !['admin', 'editor', 'viewer'].includes(role)) throw new DocumentationGrantError(400, 'Invalid role');
  try {
    return await prisma.$transaction(async tx => {
      await lockDocumentationAdministration(tx);
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join([...new Set([actorId, targetId])].sort())}) ORDER BY "id" FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (!actor || !hasPermission(actor.role, 'user.manage')) throw new DocumentationGrantError(403, 'Forbidden');
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, email: true, name: true, role: true } });
      if (!target) throw new DocumentationGrantError(404, 'Not found');
      if (role === null && actorId === targetId) throw new DocumentationGrantError(400, 'Cannot delete yourself');
      if (target.role === 'admin' && role !== 'admin' && !(await tx.user.count({ where: { role: 'admin', id: { not: targetId } } }))) throw new DocumentationGrantError(409, 'Assign another system administrator first');
      if ((role === null || role === 'viewer') && await tx.organizationDocumentationGrant.count({ where: { userId: targetId, ...(role === 'viewer' ? { role: { not: 'reader' } } : {}) } })) {
        throw new DocumentationGrantError(409, 'Reassign or revoke incompatible documentation grants first');
      }
      if (role === null && (await tx.document.count({ where: { userId: targetId } }) || await tx.folder.count({ where: { userId: targetId } }))) throw new DocumentationGrantError(409, 'Account owns documents or folders; preserve or transfer them before deletion');
      if (role === target.role) return target;
      const result = role === null ? (await tx.user.delete({ where: { id: targetId } }), null)
        : await tx.user.update({ where: { id: targetId }, data: { role }, select: { id: true, email: true, name: true, role: true } });
      await tx.activityLog.create({ data: { userId: actorId, action: role === null ? 'user.delete' : 'user.role.change', resourceType: 'user', resourceId: targetId,
        details: JSON.stringify({ previousRole: target.role, role }) } });
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') throw new DocumentationGrantError(409, 'Account still has referenced records; preserve or transfer them before deletion');
    throw error;
  }
}
