import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { auditLog } from '@/lib/audit';
import { canAccessOrganization } from '@/lib/org-scope';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  let password = await prisma.password.findFirst({
    where: { id, userId: user.id },
    select: {
      id: true,
      name: true,
      username: true,
      password: true,
      totpSecret: true,
      organizationId: true,
    },
  });

  // Org members may reveal org-linked credentials flagged client-visible
  if (!password) {
    const record = await prisma.password.findFirst({
      where: { id },
      select: {
        id: true, name: true, username: true, password: true, totpSecret: true,
        organizationId: true, clientVisible: true,
      },
    });
    if (
      record &&
      record.clientVisible &&
      record.organizationId &&
      (await canAccessOrganization(user.id, user.role, record.organizationId))
    ) {
      password = record;
    }
  }

  if (!password) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await auditLog({
    userId: user.id,
    action: 'password.view',
    resourceType: 'password',
    resourceId: id,
    resourceName: password.name,
  });

  return NextResponse.json({
    id: password.id,
    name: password.name,
    username: password.username,
    organizationId: password.organizationId,
    password: decrypt(password.password),
    totpSecret: password.totpSecret ? decrypt(password.totpSecret) : null,
  });
}
