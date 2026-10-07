import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';
import { folderUpdateSchema } from '@/lib/folder-input';
import { auditLog } from '@/lib/audit';

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
  const parsed = folderUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid folder', details: parsed.error.flatten() }, { status: 400 });

  const folder = await prisma.folder.findFirst({
    where: { id, userId: user.id },
  });

  if (!folder) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const updated = await prisma.folder.update({ where: { id, userId: user.id }, data: parsed.data });
    auditLog({ userId: user.id, action: 'folder.update', resourceType: 'folder', resourceId: id, resourceName: updated.name }).catch(() => {});
    return NextResponse.json(updated);
  } catch (cause) {
    if ((cause as { code?: string }).code === 'P2025') return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    throw cause;
  }
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

  try {
    const folder = await prisma.$transaction(async tx => {
      const current = await tx.folder.findFirst({ where: { id, userId: user.id } });
      if (!current) return null;
      await tx.document.updateMany({ where: { folderId: id }, data: { folderId: null } });
      await tx.folder.updateMany({ where: { parentId: id }, data: { parentId: current.parentId } });
      await tx.folder.delete({ where: { id } });
      return current;
    }, { isolationLevel: 'Serializable' });
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    auditLog({ userId: user.id, action: 'folder.delete', resourceType: 'folder', resourceId: id, resourceName: folder.name }).catch(() => {});
    return NextResponse.json({ message: 'Folder deleted; documents and subfolders preserved' });
  } catch (cause) {
    if (['P2034', 'P2003', 'P2025'].includes((cause as { code?: string }).code || '')) {
      return NextResponse.json({ error: 'Folder changed during deletion. Reload and try again.' }, { status: 409 });
    }
    throw cause;
  }
}
