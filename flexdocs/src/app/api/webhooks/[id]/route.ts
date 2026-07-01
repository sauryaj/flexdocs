import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

  const { id } = await params;
  const data = await request.json();

  const webhook = await prisma.webhook.updateMany({
    where: { id, userId: user.id },
    data: {
      name: data.name,
      url: data.url,
      secret: data.secret,
      events: data.events ? JSON.stringify(data.events) : undefined,
      isActive: data.isActive,
    },
  });

  return NextResponse.json(webhook);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await prisma.webhook.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ success: true });
}
