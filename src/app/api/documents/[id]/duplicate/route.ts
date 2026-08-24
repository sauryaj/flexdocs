import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

/** POST /api/documents/[id]/duplicate — clone a doc (content, category, org, tags). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'document.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const source = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: { tags: true },
  });
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const copy = await prisma.document.create({
    data: {
      title: `${source.title} (copy)`,
      content: source.content,
      category: source.category,
      folderId: source.folderId,
      organizationId: source.organizationId,
      // Copies start private so sensitive clones never leak org-wide by accident
      visibility: 'private',
      userId: user.id,
      tags: source.tags.length
        ? { connect: source.tags.map((t) => ({ id: t.id })) }
        : undefined,
    },
  });

  await prisma.documentRevision.create({
    data: {
      documentId: copy.id,
      title: copy.title,
      content: copy.content,
      category: copy.category,
      version: 1,
      message: `Duplicated from "${source.title}"`,
      userId: user.id,
    },
  }).catch(() => {});

  return NextResponse.json(copy, { status: 201 });
}
