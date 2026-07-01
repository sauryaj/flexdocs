import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const template = await prisma.documentTemplate.findFirst({
    where: { id, OR: [{ userId: user.id }, { isPublic: true }] },
  });

  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(template);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const data = await request.json();

  const template = await prisma.documentTemplate.updateMany({
    where: { id, userId: user.id },
    data,
  });

  return NextResponse.json(template);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await prisma.documentTemplate.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ success: true });
}
