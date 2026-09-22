import { z } from 'zod';
import { documentUpdateSchema } from '@/lib/document-write';
import { canAccessOrganization } from '@/lib/org-scope';
import { auditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { documentReadWhere } from '@/lib/document-access';
import { getOrgScope } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.min(1_000_000, Math.max(0, parseInt(url.searchParams.get('page') || '0') || 0));
  const limit = Math.min(100, Math.max(1, (parseInt(url.searchParams.get('limit') || '50') || 50)));

  const scope = await getOrgScope(user.id, user.role);
  const where = { ...documentReadWhere(user.id, scope), ...(organizationId ? { organizationId } : {}) };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: { tags: true, folder: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({ items: documents, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'document.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = documentUpdateSchema.extend({ title: z.string().trim().min(1).max(500), organizationId: z.string().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid document', details: parsed.error.flatten() }, { status: 400 });
  const { title, content, category, folderId, organizationId, tags, reviewDate, visibility } = parsed.data;
  if (organizationId && !await canAccessOrganization(user.id, user.role, organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (organizationId && !await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  if (folderId && !await prisma.folder.findFirst({ where: { id: folderId, userId: user.id } })) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  const result = await prisma.$transaction(async tx => {

    const document = await tx.document.create({
      data: {
        title, content: content || '',
        category: category || 'general',
        folderId: folderId || null,
        reviewDate: reviewDate ? new Date(reviewDate) : null,
        organizationId: organizationId || null, userId: user.id,
        visibility: visibility === 'org' && organizationId ? 'org' : 'private',
        tags: tags?.length
          ? {
              connectOrCreate: tags.map((tag: string) => ({
                where: { name_userId: { name: tag, userId: user.id } },
                create: { name: tag, userId: user.id },
              })),
            }
          : undefined,
      },
      include: { tags: true },
    });

    await tx.documentRevision.create({
      data: {
        documentId: document.id, title: document.title, content: document.content,
        category: document.category, version: 1, message: 'Initial version', userId: user.id,
      },
    });

    return document;
  });
  auditLog({ userId: user.id, action: 'document.create', resourceType: 'document', resourceId: result.id, resourceName: result.title }).catch(() => {});
  return NextResponse.json(result, { status: 201 });
}
