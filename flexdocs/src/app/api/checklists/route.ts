import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const [checklists, total] = await Promise.all([
    prisma.checklist.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      include: { items: { orderBy: { order: 'asc' } }, tags: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.checklist.count({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    }),
  ]);

  return NextResponse.json({ items: checklists, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description, category, dueDate, organizationId, items, tags } = await req.json();

  const checklist = await prisma.checklist.create({
    data: {
      name, description,
      category: category || 'general',
      dueDate: dueDate ? new Date(dueDate) : null,
      organizationId: organizationId || null, userId: user.id,
      items: items?.length
        ? {
            create: items.map((item: { text: string; isComplete?: boolean; order?: number }, index: number) => ({
              text: item.text,
              isComplete: item.isComplete || false,
              order: item.order ?? index,
            })),
          }
        : undefined,
      tags: tags?.length
        ? {
            connectOrCreate: tags.map((tag: string) => ({
              where: { name_userId: { name: tag, userId: user.id } },
              create: { name: tag, userId: user.id },
            })),
          }
        : undefined,
    },
    include: { items: true, tags: true },
  });

  await auditLog({
    userId: user.id,
    action: 'checklist.create',
    resourceType: 'checklist',
    resourceId: checklist.id,
    resourceName: checklist.name,
  });

  return NextResponse.json(checklist, { status: 201 });
}
