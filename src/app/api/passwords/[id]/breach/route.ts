import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { checkPasswordBreach } from '@/lib/breach-check';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const password = await prisma.password.findFirst({
    where: { id, userId: user.id },
  });
  if (!password) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const plainPassword = decrypt(password.password);
  const result = await checkPasswordBreach(plainPassword);

  await prisma.password.update({
    where: { id },
    data: {
      lastBreachCheck: new Date(),
      breachCount: result.count,
    },
  });

  return NextResponse.json(result);
}
