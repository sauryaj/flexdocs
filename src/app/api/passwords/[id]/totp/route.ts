import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { encrypt, decrypt } from '@/lib/encryption';
import { generateTotp, getKeyUri } from '@/lib/totp-password';
import { canAccessOrganization } from '@/lib/org-scope';
import { auditLog } from '@/lib/audit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const TOTP_FIELDS = {
    id: true, name: true, username: true, totpIssuer: true, totpPeriod: true, totpDigits: true,
    totpSecret: true, organizationId: true, clientVisible: true,
  } as const;

  type TotpRecord = {
    id: string; name: string; username: string; totpIssuer: string | null;
    totpPeriod: number; totpDigits: number; totpSecret: string | null;
    organizationId: string | null; clientVisible: boolean;
  };

  // Own credential first; org members may generate codes for client-visible org credentials
  let password: TotpRecord | null = await prisma.password.findFirst({
    where: { id, userId: user.id },
    select: TOTP_FIELDS,
  });

  if (!password) {
    const record = await prisma.password.findUnique({ where: { id }, select: TOTP_FIELDS });
    if (
      record &&
      record.clientVisible &&
      record.organizationId &&
      (await canAccessOrganization(user.id, user.role, record.organizationId))
    ) {
      password = record;
      await auditLog({
        userId: user.id,
        action: 'password.view',
        resourceType: 'password',
        resourceId: id,
        resourceName: record.name,
        details: { totp: true },
      }).catch(() => {});
    }
  }
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
