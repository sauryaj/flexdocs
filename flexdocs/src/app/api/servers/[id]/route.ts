import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await prisma.server.findFirst({ where: { id, userId: user.id }, include: { tags: true } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const item = await prisma.server.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.server.update({
    where: { id },
    data: {
      name: data.name, hostname: data.hostname, ipAddress: data.ipAddress, macAddress: data.macAddress,
      os: data.os, osVersion: data.osVersion, cpu: data.cpu,
      cpuCores: data.cpuCores ? parseInt(data.cpuCores) : null,
      ramGB: data.ramGB ? parseFloat(data.ramGB) : null,
      storageGB: data.storageGB ? parseFloat(data.storageGB) : null,
      storageType: data.storageType, status: data.status, location: data.location,
      rackPosition: data.rackPosition, serialNumber: data.serialNumber, assetTag: data.assetTag,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
      warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
      notes: data.notes,
      tags: data.tags !== undefined ? {
        set: [],
        connectOrCreate: data.tags.map((tag: string) => ({
          where: { name_userId: { name: tag, userId: user.id } },
          create: { name: tag, userId: user.id },
        })),
      } : undefined,
    },
    include: { tags: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await prisma.server.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.server.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
