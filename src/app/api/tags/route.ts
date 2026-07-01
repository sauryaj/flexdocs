import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tags = await prisma.tag.findMany({
    where: { userId: user.id },
    include: {
      _count: {
        select: { documents: true, passwords: true, domains: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(tags);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, color } = await req.json();

  const tag = await prisma.tag.create({
    data: {
      name,
      color: color || '#6366f1',
      userId: user.id,
    },
  });

  return NextResponse.json(tag, { status: 201 });
}
