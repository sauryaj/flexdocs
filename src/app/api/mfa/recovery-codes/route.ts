import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

export async function POST() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Delete old recovery codes
  await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });

  const codes = generateRecoveryCodes();
  await prisma.recoveryCode.createMany({
    data: codes.map((code) => ({ code, userId: user.id })),
  });

  return NextResponse.json({ codes });
}

export async function GET() {
  const user = await auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const codes = await prisma.recoveryCode.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    total: codes.length,
    used: codes.filter((c) => c.usedAt !== null).length,
    remaining: codes.filter((c) => c.usedAt === null).length,
  });
}
