import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { startScheduledScan, stopScheduledScan } from '@/lib/scan-runner';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scans = await prisma.scheduledScan.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(scans);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, type, config, cronExpression, organizationId } = await req.json();

  const scan = await prisma.scheduledScan.create({
    data: {
      name,
      type,
      config: JSON.stringify(config),
      cronExpression,
      organizationId: organizationId || null,
      userId: user.id,
    },
  });

  if (cronExpression) {
    await startScheduledScan(scan.id);
  }

  return NextResponse.json(scan);
}

export async function PUT(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, isActive, cronExpression } = await req.json();

  const scan = await prisma.scheduledScan.update({
    where: { id },
    data: { isActive, cronExpression },
  });

  if (isActive) {
    await startScheduledScan(scan.id);
  } else {
    await stopScheduledScan(scan.id);
  }

  return NextResponse.json(scan);
}
