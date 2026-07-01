import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const types = await prisma.flexibleAssetType.findMany({
    where: { userId: user.id },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(types);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, color, icon, fields } = await req.json();

  const type = await prisma.flexibleAssetType.create({
    data: {
      name,
      color: color || '#6366f1',
      icon: icon || 'box',
      fields: JSON.stringify(fields || []),
      userId: user.id,
    },
  });

  return NextResponse.json(type, { status: 201 });
}
