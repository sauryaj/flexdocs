import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';

const SOON_DAYS = 30;
const STALE_DOC_DAYS = 180;
const AGENT_OFFLINE_HOURS = 24;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessOrganization(user.id, user.role, id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const now = Date.now();
  const soonCutoff = new Date(now + SOON_DAYS * 86400000);

  const ninetyDaysAgo = new Date(now - 90 * 86400000);

  const [domains, certs, renewals, servers, tickets, docs, pwCount, assetCount, networkDocs, runbookDocs, backupDocs, freshDocs, orgRow] =
    await Promise.all([
    prisma.domain.findMany({
      where: { organizationId: id, expiresAt: { lte: soonCutoff } },
      select: { id: true, name: true, expiresAt: true },
      orderBy: { expiresAt: 'asc' },
    }),
    prisma.sslCertificate.findMany({
      where: { organizationId: id, validTo: { lte: soonCutoff } },
      select: { id: true, hostname: true, validTo: true },
      orderBy: { validTo: 'asc' },
    }),
    prisma.renewalItem.findMany({
      where: { organizationId: id, renewsAt: { lte: soonCutoff } },
      select: { id: true, name: true, vendor: true, totalCost: true, renewsAt: true },
      orderBy: { renewsAt: 'asc' },
    }),
    prisma.server.findMany({
      where: { organizationId: id, lastHeartbeatAt: { not: null } },
      select: { id: true, name: true, lastHeartbeatAt: true, agentVersion: true },
    }),
    prisma.ticket.findMany({
      where: { organizationId: id, status: { in: ['open', 'pending'] } },
      select: { id: true, subject: true, priority: true, status: true, createdAt: true, firstResponseAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.document.findMany({
      where: {
        organizationId: id,
        isArchived: false,
        updatedAt: { lt: new Date(now - STALE_DOC_DAYS * 86400000) },
      },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 10,
    }),
    prisma.password.count({ where: { organizationId: id } }),
    prisma.flexibleAsset.count({ where: { organizationId: id, isArchived: false } }),
    prisma.document.count({
      where: { organizationId: id, isArchived: false, category: { in: ['network', 'infrastructure'] } },
    }),
    prisma.document.count({
      where: { organizationId: id, isArchived: false, category: { in: ['runbook', 'procedure'] } },
    }),
    prisma.document.count({
      where: {
        organizationId: id,
        isArchived: false,
        OR: [{ category: 'backup' }, { title: { contains: 'backup', mode: 'insensitive' } }],
      },
    }),
    prisma.document.count({
      where: { organizationId: id, isArchived: false, updatedAt: { gte: ninetyDaysAgo } },
    }),
    prisma.organization.findUnique({
      where: { id },
      select: { email: true, phone: true },
    }),
  ]);

  const daysLeft = (d: Date | null) => (d ? Math.ceil((d.getTime() - now) / 86400000) : null);

  const expiringSoon = [
    ...domains.filter((d) => d.expiresAt).map((d) => ({ kind: 'domain' as const, name: d.name, date: d.expiresAt!.toISOString(), daysLeft: daysLeft(d.expiresAt) ?? 0 })),
    ...certs.map((c) => ({ kind: 'ssl' as const, name: c.hostname, date: c.validTo!.toISOString(), daysLeft: daysLeft(c.validTo) ?? 0 })),
    ...renewals.map((r) => ({ kind: 'renewal' as const, name: r.name || r.vendor || 'Renewal', date: r.renewsAt.toISOString(), daysLeft: daysLeft(r.renewsAt) ?? 0, cost: r.totalCost ?? null })),
  ].sort((a, b) => a.daysLeft - b.daysLeft);

  const slaHours: Record<string, number> = { urgent: 1, high: 4, medium: 8, low: 24 };
  const openTickets = tickets.length;
  const breachedTickets = tickets.filter(
    (t) => !t.firstResponseAt && (now - t.createdAt.getTime()) / 3600000 > (slaHours[t.priority] ?? 8),
  ).length;
  const oldestOpenDays = openTickets > 0 ? Math.floor((now - tickets[0].createdAt.getTime()) / 86400000) : 0;

  const offlineAgents = servers
    .filter((s) => s.lastHeartbeatAt && (now - s.lastHeartbeatAt.getTime()) / 3600000 > AGENT_OFFLINE_HOURS)
    .map((s) => ({
      id: s.id,
      name: s.name,
      hoursSilent: Math.floor((now - s.lastHeartbeatAt!.getTime()) / 3600000),
    }));

  const staleDocs = docs.map((d) => ({
    id: d.id,
    title: d.title,
    daysSinceUpdate: Math.floor((now - d.updatedAt.getTime()) / 86400000),
  }));

  // Documentation completeness: what a handover-ready client file should contain
  const checks = [
    { key: 'credentials', label: 'Credentials documented', done: pwCount > 0, href: '/dashboard/passwords' },
    { key: 'network', label: 'Network documentation', done: networkDocs > 0, href: '/dashboard/documents?category=network' },
    { key: 'runbook', label: 'Runbook / procedures', done: runbookDocs > 0, href: '/dashboard/documents?category=runbook' },
    { key: 'backup', label: 'Backup documentation', done: backupDocs > 0, href: '/dashboard/documents' },
    { key: 'assets', label: 'Assets tracked', done: assetCount > 0, href: '/dashboard/assets' },
    { key: 'servers', label: 'Servers documented', done: servers.length > 0, href: '/dashboard/servers' },
    { key: 'domains', label: 'Domains registered', done: domains.length > 0 || certs.length > 0, href: '/dashboard/domains' },
    { key: 'renewals', label: 'Renewals tracked', done: renewals.length > 0, href: '/dashboard/renewals' },
    { key: 'contacts', label: 'Contact details on file', done: !!(orgRow?.email || orgRow?.phone), href: '/dashboard/organizations/' + id },
    { key: 'fresh', label: 'Docs reviewed in last 90 days', done: freshDocs > 0, href: '/dashboard/documents' },
  ];
  const score = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    expiringSoon,
    tickets: { open: openTickets, breached: breachedTickets, oldestOpenDays },
    offlineAgents,
    staleDocs,
    completeness: { score, checks },
  });
}
