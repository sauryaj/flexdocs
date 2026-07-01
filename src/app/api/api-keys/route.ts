import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { generateApiKey } from '@/lib/api-keys';

export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'apikey.read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    select: {
      id: true, name: true, permissions: true, isActive: true,
      lastUsedAt: true, expiresAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(keys);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'apikey.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, permissions, expiresAt } = await req.json();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const { key, hash } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      name,
      key: hash,
      permissions: permissions || 'read',
      userId: user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({
    ...apiKey,
    key, // Only returned on creation
  }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'apikey.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await prisma.apiKey.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.apiKey.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
