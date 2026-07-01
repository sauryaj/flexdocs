import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await prisma.statusPage.findFirst({
    where: { id, userId: user.id },
    include: { components: { orderBy: { position: 'asc' } }, incidents: { orderBy: { createdAt: 'desc' } } },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const item = await prisma.statusPage.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.statusPage.update({
    where: { id },
    data: {
      name: data.name, description: data.description, isPublic: data.isPublic,
    },
    include: { components: true },
  });

  if (data.components) {
    await prisma.statusComponent.deleteMany({ where: { statusPageId: id } });
    if (data.components.length > 0) {
      await prisma.statusComponent.createMany({
        data: data.components.map((c: any, i: number) => ({
          name: c.name, status: c.status || 'operational', position: c.position ?? i, statusPageId: id,
        })),
      });
    }
  }

  const result = await prisma.statusPage.findFirst({
    where: { id },
    include: { components: { orderBy: { position: 'asc' } }, incidents: { orderBy: { createdAt: 'desc' } } },
  });
  return NextResponse.json(result);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await prisma.statusPage.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.statusPage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
