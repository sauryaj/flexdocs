import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  try {
    const user = await auth();
    if (!user) return NextResponse.json({ enabled: false }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mfaSettings = await (prisma as any).mfaSettings?.findFirst({
      where: { userId: user.id },
    });

    return NextResponse.json({
      enabled: Boolean(mfaSettings?.enabled),
      method: mfaSettings?.method || 'totp',
      lastUsed: mfaSettings?.lastUsed || null,
    });
  } catch {
    return NextResponse.json({ enabled: false, method: 'totp' });
  }
}
