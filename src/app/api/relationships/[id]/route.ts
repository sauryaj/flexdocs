import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { accessibleEntity } from '@/lib/entity-access';
import { getOrgScope } from '@/lib/org-scope';
import { auditLog } from '@/lib/audit';
import { type UserRole } from '@prisma/client';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'document.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const relationship = await prisma.relationship.findUnique({
    where: { id },
  });

  if (!relationship) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const scope = await getOrgScope(user.id, user.role);
  if (await accessibleEntity(relationship.sourceType, relationship.sourceId, user.id, scope) === null ||
      await accessibleEntity(relationship.targetType, relationship.targetId, user.id, scope) === null ||
      (await accessibleEntity(relationship.sourceType, relationship.sourceId, user.id, scope, true) === null &&
       await accessibleEntity(relationship.targetType, relationship.targetId, user.id, scope, true) === null)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  void auditLog({ userId: user.id, action: 'relationship.delete', resourceType: 'relationship', resourceId: id });
  await prisma.relationship.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
