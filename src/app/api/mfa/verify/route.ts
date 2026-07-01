import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/totp';

export async function POST(request: Request) {
  const user = await auth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code } = await request.json();

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.mfaSecret) {
    return NextResponse.json({ error: 'MFA not set up' }, { status: 400 });
  }

  const isValid = verifyToken(dbUser.mfaSecret, code);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });

  return NextResponse.json({ success: true });
}
