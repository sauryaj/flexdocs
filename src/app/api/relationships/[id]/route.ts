import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
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

  await prisma.relationship.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
