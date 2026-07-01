import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const [servers, total] = await Promise.all([
    prisma.server.findMany({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
      include: { tags: true },
      orderBy: { updatedAt: 'desc' },
      skip: page * limit,
      take: limit,
    }),
    prisma.server.count({
      where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    }),
  ]);

  return NextResponse.json({ items: servers, total, page, limit, hasMore: (page + 1) * limit < total });
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    name, hostname, ipAddress, macAddress, os, osVersion,
    cpu, cpuCores, ramGB, storageGB, storageType, status,
    location, rackPosition, serialNumber, assetTag,
    purchaseDate, warrantyExpiry, notes, organizationId, tags,
  } = await req.json();

  const server = await prisma.server.create({
    data: {
      name, hostname, ipAddress, macAddress, os, osVersion,
      cpu, cpuCores: cpuCores ? parseInt(cpuCores) : null,
      ramGB: ramGB ? parseFloat(ramGB) : null,
      storageGB: storageGB ? parseFloat(storageGB) : null,
      storageType, status: status || 'active',
      location, rackPosition, serialNumber, assetTag,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
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

  return NextResponse.json(server, { status: 201 });
}
