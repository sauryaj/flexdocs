import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  try {
    const user = await auth();
    if (!user) return NextResponse.json({ enabled: false }, { status: 401 });

    const mfaSettings = await (prisma as unknown as Record<string, { findFirst: (args: Record<string, unknown>) => Promise<unknown> }).mfaSettings?.findFirst({
      where: { userId: user.id },
    }) as Record<string, unknown> | null;

    return NextResponse.json({
      enabled: Boolean(mfaSettings?.enabled),
      method: mfaSettings?.method || 'totp',
      lastUsed: mfaSettings?.lastUsed || null,
    });
  } catch {
    return NextResponse.json({ enabled: false, method: 'totp' });
  }
}
