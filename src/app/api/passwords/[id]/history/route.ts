import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const history = await prisma.passwordHistory.findMany({
    where: { passwordId: id, userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(history.map((h) => ({
    ...h,
    oldPassword: decrypt(h.oldPassword),
    newPassword: decrypt(h.newPassword),
  })));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { revertToHistoryId } = await req.json();

  const password = await prisma.password.findFirst({
    where: { id, userId: user.id },
  });
  if (!password) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (revertToHistoryId) {
    // Revert to a previous password
    const historyEntry = await prisma.passwordHistory.findFirst({
      where: { id: revertToHistoryId, passwordId: id },
    });
    if (!historyEntry) return NextResponse.json({ error: 'History entry not found' }, { status: 404 });

    const oldPassword = password.password;
    const revertedPassword = historyEntry.oldPassword;

    await prisma.password.update({
      where: { id },
      data: { password: revertedPassword },
    });

    await prisma.passwordHistory.create({
      data: {
        passwordId: id,
        oldPassword,
        newPassword: revertedPassword,
        userId: user.id,
        reason: 'revert',
      },
    });

    return NextResponse.json({ success: true, reverted: true });
  }

  return NextResponse.json({ error: 'revertToHistoryId required' }, { status: 400 });
}
