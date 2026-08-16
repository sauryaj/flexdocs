import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { lastActive: 'desc' },
    select: {
      id: true,
      ip: true,
      userAgent: true,
      lastActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      device: s.userAgent || 'Unknown device',
      ip: s.ip || '',
      location: '',
      lastActive: s.lastActive.toISOString(),
      current: s.id === req.headers.get('x-session-id'),
    }))
  );
}

export async function DELETE(request: Request) {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.pathname.split('/').pop();
  const body = await request.json().catch(() => ({}));

  if (sessionId && sessionId !== 'sessions' && !body.sessionId) {
    await prisma.session.deleteMany({
      where: { id: sessionId, userId: user.id },
    });
  } else if (body.sessionId && body.sessionId !== 'all') {
    await prisma.session.deleteMany({
      where: { id: body.sessionId, userId: user.id },
    });
  } else {
    await prisma.session.deleteMany({ where: { userId: user.id } });
  }

  return NextResponse.json({ success: true });
}
