import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = await prisma.documentTemplate.findMany({
    where: { OR: [{ userId: user.id }, { isPublic: true }] },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(templates);
}

export async function POST(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description, category, content, icon, isPublic } = await request.json();

  const template = await prisma.documentTemplate.create({
    data: { name, description, category, content, icon, isPublic, userId: user.id },
  });

  return NextResponse.json(template, { status: 201 });
}
