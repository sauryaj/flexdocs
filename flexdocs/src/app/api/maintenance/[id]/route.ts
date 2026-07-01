import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await prisma.maintenanceWindow.findFirst({ where: { id, userId: user.id }, include: { tags: true } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const data = await req.json();
  const item = await prisma.maintenanceWindow.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.maintenanceWindow.update({
    where: { id },
    data: {
      name: data.name, description: data.description,
      startTime: new Date(data.startTime), endTime: new Date(data.endTime),
      recurrence: data.recurrence, status: data.status, priority: data.priority,
      impact: data.impact,
      affectedSystems: JSON.stringify(data.affectedSystems || []),
      notifyEmails: JSON.stringify(data.notifyEmails || []),
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
  const item = await prisma.maintenanceWindow.findFirst({ where: { id, userId: user.id } });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.maintenanceWindow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
