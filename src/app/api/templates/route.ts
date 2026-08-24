import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

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
  if (!hasPermission(user.role as UserRole, 'document.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description, category, content, icon, isPublic } = await request.json();

  const template = await prisma.documentTemplate.create({
    data: { name, description, category, content, icon, isPublic, userId: user.id },
  });

  return NextResponse.json(template, { status: 201 });
}
