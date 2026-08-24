import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const webhook = await prisma.webhook.findFirst({
    where: { id, userId: user.id },
  });

  if (!webhook) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(webhook);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'webhook.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const data = await request.json();

  const webhook = await prisma.webhook.updateMany({
    where: { id, userId: user.id },
    data: {
      name: data.name,
      url: data.url,
      secret: data.secret,
      events: data.events ? JSON.stringify(data.events) : undefined,
      isActive: data.isActive ?? data.active,
    },
  });

  return NextResponse.json(webhook);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'webhook.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  await prisma.webhook.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ success: true });
}
