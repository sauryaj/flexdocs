import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const folders = await prisma.folder.findMany({
    where: {
      userId: user.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: {
      _count: { select: { documents: true, children: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(folders);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'document.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, color, icon, parentId, organizationId } = await req.json();

  const folder = await prisma.folder.create({
    data: {
      name,
      color: color || '#3b82f6',
      icon: icon || 'folder',
      parentId: parentId || null,
      organizationId: organizationId || null,
      userId: user.id,
    },
  });

  return NextResponse.json(folder, { status: 201 });
}
