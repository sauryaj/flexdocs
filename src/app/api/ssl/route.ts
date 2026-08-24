import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const scope = await getOrgScope(user.id, user.role);
  const orgWhere = scopeOrgWhere(scope, organizationId);

  const certificates = await prisma.sslCertificate.findMany({
    where:
      scope.mode === 'limited'
        ? orgWhere
        : {
            userId: user.id,
            ...(organizationId ? { organizationId } : {}),
          },
    include: {
      _count: { select: { domains: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(certificates);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'domain.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  const certificate = await prisma.sslCertificate.create({
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
      userId: user.id,
    },
    include: { _count: { select: { domains: true } } },
  });

  await auditLog({
    userId: user.id,
    action: 'domain.create',
    resourceType: 'ssl_certificate',
    resourceId: certificate.id,
    resourceName: hostname,
    details: { issuer, serialNumber },
  });

  return NextResponse.json(certificate, { status: 201 });
}
