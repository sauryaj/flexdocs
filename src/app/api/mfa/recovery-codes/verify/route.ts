import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code } = await request.json();

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Code required' }, { status: 400 });
  }

  const recoveryCode = await prisma.recoveryCode.findFirst({
    where: { userId: user.id, code: code.toUpperCase(), usedAt: null },
  });

  if (!recoveryCode) {
    return NextResponse.json({ error: 'Invalid recovery code' }, { status: 400 });
  }

  await prisma.recoveryCode.update({
    where: { id: recoveryCode.id },
    data: { usedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
