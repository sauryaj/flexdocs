import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const provider = url.searchParams.get('provider') || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const [resources, total] = await Promise.all([
    prisma.cloudResource.findMany({
      where: {
        userId: user.id,
        ...(organizationId ? { organizationId } : {}),
        ...(provider ? { provider } : {}),
      },
      include: { tags: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.cloudResource.count({
      where: {
        userId: user.id,
        ...(organizationId ? { organizationId } : {}),
        ...(provider ? { provider } : {}),
      },
    }),
  ]);

  return NextResponse.json({ items: resources, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    name, provider, service, resourceId, region, status,
    cost, costCurrency, cloudTags, metadata, notes,
    organizationId, tags,
  } = await req.json();

  const resource = await prisma.cloudResource.create({
    data: {
      name, provider: provider || 'aws', service, resourceId, region,
      status: status || 'active',
      cost: cost ? parseFloat(cost) : null,
      costCurrency: costCurrency || 'USD',
      cloudTags: JSON.stringify(cloudTags || {}),
      metadata: JSON.stringify(metadata || {}),
      notes, organizationId: organizationId || null, userId: user.id,
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

  return NextResponse.json(resource, { status: 201 });
}
