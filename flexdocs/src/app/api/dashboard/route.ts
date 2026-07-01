import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDaysUntilExpiry } from '@/lib/utils';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;

  const where = {
    userId: user.id,
    ...(organizationId ? { organizationId } : {}),
  };

  const [docCount, passCount, domainCount, domains, recentDocs, recentPasswords] =
    await Promise.all([
      prisma.document.count({ where }),
      prisma.password.count({ where }),
      prisma.domain.count({ where }),
      prisma.domain.findMany({
        where,
        orderBy: { expiresAt: 'asc' },
        take: 5,
      }),
      prisma.document.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      prisma.password.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

  const expiringDomains = domains.filter(
    (d) => d.expiresAt && getDaysUntilExpiry(d.expiresAt) < 30
  );

  return NextResponse.json({
    docCount,
    passCount,
    domainCount,
    expiringDomains,
    recentDocs,
    recentPasswords,
  });
}
