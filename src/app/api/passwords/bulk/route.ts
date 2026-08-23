import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prisma } from '@/lib/prisma';

type BulkAction = 'delete' | 'tag' | 'favorite' | 'unfavorite';

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'password.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { action, ids, tag } = await req.json().catch(() => ({}));
  const valid: BulkAction[] = ['delete', 'tag', 'favorite', 'unfavorite'];
  if (!valid.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${valid.join(', ')}` }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }
  if (ids.length > 200) {
    return NextResponse.json({ error: 'too many ids (max 200)' }, { status: 400 });
  }

  const owned = await prisma.password.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: { id: true },
  });
  const ownedIds = owned.map((p) => p.id);

  let updated = 0;

  if (action === 'delete') {
    await prisma.$executeRaw`DELETE FROM "_PasswordToTag" WHERE "A" IN (${ownedIds.length ? ownedIds : ['']})`;
    const res = await prisma.password.deleteMany({ where: { id: { in: ownedIds }, userId: user.id } });
    updated = res.count;
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
        INSERT INTO "_PasswordToTag" ("A", "B")
        SELECT ${id}, ${t.id}
        WHERE NOT EXISTS (
          SELECT 1 FROM "_PasswordToTag" WHERE "A" = ${id} AND "B" = ${t.id}
        )`;
      updated++;
    }
  } else {
    const res = await prisma.password.updateMany({
      where: { id: { in: ownedIds }, userId: user.id },
      data: { isFavorite: action === 'favorite' },
    });
    updated = res.count;
  }

  return NextResponse.json({ ok: true, matched: ownedIds.length, updated, requested: ids.length });
}
