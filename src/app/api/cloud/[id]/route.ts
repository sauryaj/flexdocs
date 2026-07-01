import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await prisma.cloudResource.findFirst({ where: { id, userId: user.id }, include: { tags: true } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const item = await prisma.cloudResource.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.cloudResource.update({
    where: { id },
    data: {
      name: data.name, provider: data.provider, service: data.service, resourceId: data.resourceId,
      region: data.region, status: data.status,
      cost: data.cost ? parseFloat(data.cost) : null, costCurrency: data.costCurrency,
      cloudTags: typeof data.cloudTags === 'string' ? data.cloudTags : JSON.stringify(data.cloudTags || {}),
      metadata: typeof data.metadata === 'string' ? data.metadata : JSON.stringify(data.metadata || {}),
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
  const item = await prisma.cloudResource.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.cloudResource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
