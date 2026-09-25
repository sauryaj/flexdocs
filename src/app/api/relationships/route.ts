import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getOrgScope } from '@/lib/org-scope';
import { accessibleEntity, entityTypes } from '@/lib/entity-access';
import { auditLog } from '@/lib/audit';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scope = await getOrgScope(user.id, user.role);
  const q = new URL(req.url).searchParams;
  const type = q.get('entityType'), id = q.get('entityId');
  const sourceType = q.get('sourceType'), sourceId = q.get('sourceId');
  const targetType = q.get('targetType'), targetId = q.get('targetId');
  for (const [kind, key] of [[type, id], [sourceType, sourceId], [targetType, targetId]]) {
    if (Boolean(kind) !== Boolean(key)) return NextResponse.json({ error: 'Entity type and id must be supplied together' }, { status: 400 });
    if (kind && key && await accessibleEntity(kind, key, user.id, scope) === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const rows = await prisma.relationship.findMany({ where: {
    ...(type && id ? { OR: [{ sourceType: type, sourceId: id }, { targetType: type, targetId: id }] } : {}),
    ...(sourceType && sourceId ? { sourceType, sourceId } : {}),
    ...(targetType && targetId ? { targetType, targetId } : {}),
  }, orderBy: { createdAt: 'desc' } });
  const cache = new Map<string, Promise<string | null>>();
  const name = (kind: string, key: string) => {
    const cacheKey = `${kind}:${key}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, accessibleEntity(kind, key, user.id, scope));
    return cache.get(cacheKey)!;
  };
  const rowsWithNames = await Promise.all(rows.map(async row => ({ ...row,
    sourceName: await name(row.sourceType, row.sourceId), targetName: await name(row.targetType, row.targetId),
  })));
  return NextResponse.json(rowsWithNames.filter(row => row.sourceName !== null && row.targetName !== null));
}

const schema = z.object({
  sourceType: z.enum(entityTypes), sourceId: z.string().min(1), targetType: z.enum(entityTypes), targetId: z.string().min(1),
  name: z.string().trim().max(100).optional(), notes: z.string().max(2000).nullable().optional(),
});
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.create')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid relationship' }, { status: 400 });
  const data = parsed.data;
  const scope = await getOrgScope(user.id, user.role);
  if (await accessibleEntity(data.sourceType, data.sourceId, user.id, scope, true) === null ||
      await accessibleEntity(data.targetType, data.targetId, user.id, scope) === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.sourceType === data.targetType && data.sourceId === data.targetId) return NextResponse.json({ error: 'Cannot link a record to itself' }, { status: 400 });
  try {
    const relationship = await prisma.relationship.create({ data: { ...data, name: data.name || 'related_to' } });
    void auditLog({ userId: user.id, action: 'relationship.create', resourceType: 'relationship', resourceId: relationship.id });
    return NextResponse.json(relationship, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'These records are already linked with that relationship' }, { status: 409 });
    throw error;
  }
}
