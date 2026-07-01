import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const certificate = await prisma.sslCertificate.findFirst({
    where: { id, userId: user.id },
    include: { domains: true },
  });

  if (!certificate) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(certificate);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const {
    hostname,
    issuer,
    subject,
    validFrom,
    validTo,
    serialNumber,
    signatureAlgo,
    keySize,
    san,
    isExpired,
    isSelfSigned,
    organizationId,
  } = await req.json();

  const existing = await prisma.sslCertificate.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const certificate = await prisma.sslCertificate.update({
    where: { id },
    data: {
      hostname,
      issuer,
      subject,
      validFrom: validFrom ? new Date(validFrom) : null,
      validTo: validTo ? new Date(validTo) : null,
      serialNumber,
      signatureAlgo,
      keySize: keySize ? Number(keySize) : null,
      san,
      isExpired: isExpired ?? false,
      isSelfSigned: isSelfSigned ?? false,
      organizationId: organizationId || null,
    },
    include: { domains: true },
  });

  await auditLog({
    userId: user.id,
    action: 'domain.update',
    resourceType: 'ssl_certificate',
    resourceId: id,
    resourceName: hostname,
  });

  return NextResponse.json(certificate);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.sslCertificate.findFirst({
    where: { id, userId: user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.domain.updateMany({
    where: { sslCertId: id },
    data: { sslCertId: null },
  });

  await prisma.sslCertificate.delete({ where: { id } });

  await auditLog({
    userId: user.id,
    action: 'domain.delete',
    resourceType: 'ssl_certificate',
    resourceId: id,
    resourceName: existing.hostname,
  });

  return NextResponse.json({ message: 'Deleted' });
}
