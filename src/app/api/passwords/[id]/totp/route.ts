import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { generateTotp, getKeyUri } from '@/lib/totp-password';

export async function GET(
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

  if (!password.totpSecret) {
    return NextResponse.json({ configured: false });
  }

  const secret = decrypt(password.totpSecret);
  const code = generateTotp(secret, Math.floor(Date.now() / 1000), password.totpPeriod, password.totpDigits);
  const uri = getKeyUri(secret, password.username, password.totpIssuer || password.name, password.totpPeriod, password.totpDigits);

  // Calculate remaining seconds
  const remaining = password.totpPeriod - (Math.floor(Date.now() / 1000) % password.totpPeriod);

  return NextResponse.json({
    configured: true,
    code,
    remaining,
    uri,
    issuer: password.totpIssuer,
    period: password.totpPeriod,
    digits: password.totpDigits,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { totpSecret, totpIssuer, totpPeriod, totpDigits } = await req.json();

  const password = await prisma.password.findFirst({
    where: { id, userId: user.id },
  });
  if (!password) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.password.update({
    where: { id },
    data: {
      totpSecret: totpSecret ? encrypt(totpSecret) : null,
      totpIssuer: totpIssuer || null,
      totpPeriod: totpPeriod || 30,
      totpDigits: totpDigits || 6,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(
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

  await prisma.password.update({
    where: { id },
    data: { totpSecret: null, totpIssuer: null },
  });

  return NextResponse.json({ success: true });
}
