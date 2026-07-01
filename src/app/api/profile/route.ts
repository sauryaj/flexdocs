import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const authUser = await auth();
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      bio: true,
      phone: true,
      timezone: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      _count: {
        select: {
          documents: true,
          passwords: true,
          domains: true,
          tags: true,
        },
      },
    },
  });

  return NextResponse.json(user);
}

export async function PUT(req: Request) {
  const authUser = await auth();
  if (!authUser?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, avatar, bio, phone, timezone } = await req.json();

  const user = await prisma.user.update({
    where: { id: authUser.id },
    data: {
      ...(name !== undefined && { name }),
      ...(avatar !== undefined && { avatar }),
      ...(bio !== undefined && { bio }),
      ...(phone !== undefined && { phone }),
      ...(timezone !== undefined && { timezone }),
    },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      bio: true,
      phone: true,
      timezone: true,
      role: true,
    },
  });

  return NextResponse.json(user);
}
