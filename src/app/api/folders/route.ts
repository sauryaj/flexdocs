import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';
import { folderCreateSchema } from '@/lib/folder-input';
import { canAccessOrganization } from '@/lib/org-scope';
import { auditLog } from '@/lib/audit';

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
      _count: { select: { documents: { where: { deletedAt: null } }, children: true } },
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

  const parsed = folderCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid folder', details: parsed.error.flatten() }, { status: 400 });
  const { name, color, icon, parentId } = parsed.data;
  let organizationId = parsed.data.organizationId ?? null;
  if (parentId) {
    const parent = await prisma.folder.findFirst({ where: { id: parentId, userId: user.id } });
    if (!parent) return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 });
    if (parsed.data.organizationId !== undefined && organizationId !== parent.organizationId) {
      return NextResponse.json({ error: 'Subfolders must belong to the same organization as their parent' }, { status: 400 });
    }
    organizationId = parent.organizationId;
  }
  if (organizationId && !await canAccessOrganization(user.id, user.role, organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (organizationId && !await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

  try {
    const folder = await prisma.folder.create({
      data: {
        name,
        color: color || '#3b82f6',
        icon: icon || 'folder',
        parentId: parentId || null,
        organizationId,
        userId: user.id,
      },
    });

    auditLog({ userId: user.id, action: 'folder.create', resourceType: 'folder', resourceId: folder.id, resourceName: folder.name }).catch(() => {});
    return NextResponse.json(folder, { status: 201 });
  } catch (cause) {
    if ((cause as { code?: string }).code === 'P2003') return NextResponse.json({ error: 'Parent folder or organization changed. Reload and try again.' }, { status: 409 });
    throw cause;
  }
}
