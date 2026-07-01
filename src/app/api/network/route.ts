import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const type = url.searchParams.get('type') || undefined;

  const items = await prisma.networkDocument.findMany({
    where: {
      userId: user.id,
      ...(organizationId ? { organizationId } : {}),
      ...(type ? { type } : {}),
    },
    include: { tags: true },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, type, content, notes, organizationId, tags } = await req.json();

  const item = await prisma.networkDocument.create({
    data: {
      name,
      type: type || 'ip-schema',
      content: JSON.stringify(content || {}),
      notes,
      organizationId: organizationId || null,
      userId: user.id,
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

  return NextResponse.json(item, { status: 201 });
}
