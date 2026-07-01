import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateSecret, getKeyUri } from '@/lib/totp';
import QRCode from 'qrcode';

export async function POST() {
  const user = await auth();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = generateSecret();
  const otpauth = getKeyUri('FlexDocs', user.email || 'user', secret);
  const qrCodeUrl = await QRCode.toDataURL(otpauth);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret },
  });

  return NextResponse.json({ secret, qrCodeUrl, otpauth });
}
