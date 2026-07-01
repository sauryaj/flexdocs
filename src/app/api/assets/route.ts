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

  const [assets, total] = await Promise.all([
    prisma.flexibleAsset.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      include: { tags: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.flexibleAsset.count({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    }),
  ]);

  return NextResponse.json({ items: assets, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, assetType, fields, notes, organizationId, tags } = await req.json();

  const asset = await prisma.flexibleAsset.create({
    data: {
      name, assetType,
      fields: JSON.stringify(fields || {}),
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

  await auditLog({
    userId: user.id,
    action: 'asset.create',
    resourceType: 'asset',
    resourceId: asset.id,
    resourceName: asset.name,
    details: { assetType },
    ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
  });

  return NextResponse.json(asset, { status: 201 });
}
