import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';
import { type UserRole } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: { tags: true, folder: true },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(document);
}

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
  const { title, content, category, folderId, isPinned, isArchived, tags, reviewDate, reviewAcknowledged, visibility } = await req.json();

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.document.update({
    where: { id },
    data: {
      // Partial-update safe: only write fields the client actually sent,
      // so autosave pings or narrow PATCHes never wipe untouched columns.
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(folderId !== undefined ? { folderId: folderId || null } : {}),
      ...(isPinned !== undefined ? { isPinned } : {}),
      ...(isArchived !== undefined ? { isArchived } : {}),
      // tags are synced by the raw join-table block below (body sends names, not ids)
      ...(reviewDate !== undefined
        ? { reviewDate: reviewDate ? new Date(reviewDate) : null }
        : {}),
      ...(reviewAcknowledged ? { lastReviewedAt: new Date() } : {}),
      ...(visibility !== undefined
        ? { visibility: visibility === 'org' && document.organizationId ? 'org' : 'private' }
        : {}),
    },
  });

  const sent: Record<string, unknown> = { title, content, category, folderId, isPinned, isArchived, tags, reviewDate, visibility };
  if (reviewAcknowledged) sent.reviewAcknowledged = true;
  const changedFields = Object.keys(sent).filter((k) => sent[k] !== undefined);
  auditLog({
    userId: user.id,
    action: 'document.update',
    resourceType: 'document',
    resourceId: id,
    resourceName: title ?? document.title,
    details: { fields: changedFields.length > 0 ? changedFields : ['unknown'] },
  }).catch(() => {});

  // Snapshot the overwritten content so manual saves AND autosaves stay
  // recoverable. Skips when the latest revision already holds that exact
  // content (redundant) or when saves land <15s apart (burst throttle).
  if (typeof content === 'string' && content !== document.content) {
    const latest = await prisma.documentRevision.findFirst({
      where: { documentId: id },
      orderBy: { version: 'desc' },
    });
    const redundant = !!latest && latest.content === document.content;
    const burst = !!latest && Date.now() - latest.createdAt.getTime() < 15_000;
    if (!redundant && !burst) {
      await prisma.documentRevision.create({
        data: {
          documentId: id,
          title: document.title,
          content: document.content,
          category: document.category,
          version: (latest?.version || 0) + 1,
          message: 'Auto-saved before overwrite',
          userId: user.id,
        },
      });
      // keep history bounded to the latest 50 revisions
      const stale = await prisma.documentRevision.findMany({
        where: { documentId: id },
        orderBy: { version: 'desc' },
        skip: 50,
        select: { id: true },
      });
      if (stale.length > 0) {
        await prisma.documentRevision.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
      }
    }
  }

  if (tags !== undefined) {
    await prisma.$executeRaw`DELETE FROM "_DocumentToTag" WHERE "A" = ${id}`;
    if (tags.length > 0) {
      const tagResults = await Promise.all(
        tags.map((tagName: string) =>
          prisma.tag.upsert({
            where: { name_userId: { name: tagName, userId: user.id } },
            update: {},
            create: { name: tagName, userId: user.id },
          })
        )
      );
      await Promise.all(
        tagResults.map((tag) =>
          prisma.$executeRaw`INSERT INTO "_DocumentToTag" ("A", "B") VALUES (${id}, ${tag.id})`
        )
      );
    }
  }

  const updated = await prisma.document.findFirst({
    where: { id },
    include: { tags: true },
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

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.document.delete({ where: { id } });

  return NextResponse.json({ message: 'Deleted' });
}
