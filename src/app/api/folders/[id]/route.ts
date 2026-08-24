import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'document.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { name, color } = await req.json();

  const folder = await prisma.folder.findFirst({
    where: { id, userId: user.id },
  });

  if (!folder) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await prisma.folder.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
    },
  });

  return NextResponse.json(updated);
}

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

  const folder = await prisma.folder.findFirst({
    where: { id, userId: user.id },
  });

  if (!folder) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Move documents to root (null folderId)
  await prisma.document.updateMany({
    where: { folderId: id },
    data: { folderId: null },
  });

  // Move subfolders to root
  await prisma.folder.updateMany({
    where: { parentId: id },
    data: { parentId: folder.parentId },
  });

  await prisma.folder.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
