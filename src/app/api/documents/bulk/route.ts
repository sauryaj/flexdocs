import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

type BulkAction = 'archive' | 'unarchive' | 'pin' | 'unpin' | 'delete' | 'tag';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action, ids, tag } = await req.json().catch(() => ({}));
  const valid: BulkAction[] = ['archive', 'unarchive', 'pin', 'unpin', 'delete', 'tag'];
  if (!valid.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${valid.join(', ')}` }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string' || !id)) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: 'too many ids (max 200)' }, { status: 400 });
  }

  const owned = await prisma.document.findMany({
    where: { deletedAt: null, id: { in: ids }, userId: user.id },
    select: { id: true },
  });
  const ownedIds = owned.map((d) => d.id);

  let updated = 0;

  if (action === 'delete') {
    if (!hasPermission(user.role, 'document.delete')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const res = await prisma.document.updateMany({ where: { id: { in: ownedIds }, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
    updated = res.count;
    auditLog({ userId: user.id, action: 'document.trash.bulk', resourceType: 'document', details: { ids: ownedIds, updated } }).catch(() => {});
  } else if (action === 'tag') {
    if (!tag || typeof tag !== 'string') {
      return NextResponse.json({ error: 'tag string required for tag action' }, { status: 400 });
    }
    const t = await prisma.tag.upsert({
      where: { name_userId: { name: tag, userId: user.id } },
      update: {},
      create: { name: tag, userId: user.id },
    });
    for (const id of ownedIds) {
      await prisma.$executeRaw`
        INSERT INTO "_DocumentToTag" ("A", "B")
        SELECT ${id}, ${t.id}
        WHERE NOT EXISTS (
          SELECT 1 FROM "_DocumentToTag" WHERE "A" = ${id} AND "B" = ${t.id}
        )`;
      updated++;
    }
  } else {
    const data =
      action === 'archive' ? { isArchived: true }
      : action === 'unarchive' ? { isArchived: false }
      : action === 'pin' ? { isPinned: true }
      : { isPinned: false };
    const res = await prisma.document.updateMany({ where: { id: { in: ownedIds }, userId: user.id, deletedAt: null }, data });
    updated = res.count;
  }

  return NextResponse.json({ ok: true, matched: ownedIds.length, updated, requested: ids.length });
}
