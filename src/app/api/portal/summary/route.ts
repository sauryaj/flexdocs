import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgScope } from '@/lib/org-scope';

const HORIZON = 90 * 86400000;

/** Client portal summary: scoped counts, expiries and KB articles for the member orgs. */
export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getOrgScope(user.id, user.role);
  if (scope.mode === 'limited' && scope.orgIds.length === 0) {
    return NextResponse.json({ orgs: [], serverCount: 0, kb: [], expiries: [], renewals: [] });
  }

  const orgWhere =
    scope.mode === 'limited'
      ? { organizationId: { in: scope.orgIds } }
      : {};
  const horizon = new Date(Date.now() + HORIZON);
  const now = Date.now();
  const days = (d: Date | null) => (d ? Math.ceil((d.getTime() - now) / 86400000) : null);

  const [orgs, kb, domains, certs, servers, renewals] = await Promise.all([
    prisma.organization.findMany({
      where: scope.mode === 'limited' ? { id: { in: scope.orgIds } } : undefined,
      select: { id: true, name: true },
    }),
    prisma.document.findMany({
      where: { ...orgWhere, visibility: 'org', isArchived: false },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.domain.findMany({
      where: { ...orgWhere, expiresAt: { not: null, lte: horizon } },
      select: { name: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
      take: 20,
    }),
    prisma.sslCertificate.findMany({
      where: { ...orgWhere, validTo: { not: null, lte: horizon } },
      select: { hostname: true, validTo: true },
      orderBy: { validTo: 'asc' },
      take: 20,
    }),
    prisma.server.count({ where: orgWhere }),
    prisma.renewalItem.findMany({
      where: {
        ...(scope.mode === 'limited'
          ? { organizationId: { in: scope.orgIds } }
          : { userId: user.id }),
        renewsAt: { lte: horizon },
      },
      select: { name: true, renewsAt: true },
      orderBy: { renewsAt: 'asc' },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    orgs,
    serverCount: servers,
    kb: kb.map((k) => ({ ...k, updatedAt: k.updatedAt.toISOString() })),
    expiries: [
      ...domains.map((d) => ({ kind: 'domain', name: d.name, when: d.expiresAt!.toISOString(), days: days(d.expiresAt) })),
      ...certs.map((c) => ({ kind: 'ssl', name: c.hostname, when: c.validTo!.toISOString(), days: days(c.validTo) })),
      ...renewals.map((r) => ({ kind: 'renewal', name: r.name, when: r.renewsAt.toISOString(), days: days(r.renewsAt) })),
    ].sort((a, b) => a.days! - b.days!),
    renewals: [],
  });
}
