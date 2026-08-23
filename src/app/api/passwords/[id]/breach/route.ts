import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';
import { checkPasswordBreach } from '@/lib/breach-check';
import { createNotification } from '@/lib/notifications';
import { sendBreachAlert } from '@/lib/email';

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

  if (result.breached) {
    await createNotification({
      userId: user.id,
      type: 'breach',
      title: 'Password found in breach',
      message: `${password.name} has appeared in ${result.count.toLocaleString()} known breach${result.count !== 1 ? 'es' : ''}. Consider rotating it.`,
      severity: 'danger',
      link: `/dashboard/passwords/${id}`,
    });

    if (user.email) {
      sendBreachAlert(user.email, password.name, result.count).catch(() => {});
    }
  }

  return NextResponse.json(result);
}
