import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { lastActive: 'desc' },
  });

  return NextResponse.json(sessions);
}

export async function DELETE(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await request.json();

  if (sessionId === 'all') {
    await prisma.session.deleteMany({ where: { userId: user.id } });
  } else {
    await prisma.session.deleteMany({
      where: { id: sessionId, userId: user.id },
    });
  }

  return NextResponse.json({ success: true });
}
