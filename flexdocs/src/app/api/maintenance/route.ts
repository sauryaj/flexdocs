import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const windows = await prisma.maintenanceWindow.findMany({
    where: {
      userId: user.id,
      ...(organizationId ? { organizationId } : {}),
    },
    include: { tags: true },
    orderBy: { startTime: 'desc' },
  });

  return NextResponse.json(windows);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    name, description, startTime, endTime, recurrence,
    status, priority, impact, affectedSystems, notifyEmails,
    organizationId, tags,
  } = await req.json();

  const window = await prisma.maintenanceWindow.create({
    data: {
      name,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      recurrence,
      status: status || 'scheduled',
      priority: priority || 'medium',
      impact,
      affectedSystems: JSON.stringify(affectedSystems || []),
      notifyEmails: JSON.stringify(notifyEmails || []),
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

  return NextResponse.json(window, { status: 201 });
}
