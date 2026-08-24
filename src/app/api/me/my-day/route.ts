import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgScope, scopeOrgWhere } from '@/lib/org-scope';

const EXPIRY_WINDOW_DAYS = 7;
const AGENT_OFFLINE_HOURS = 24;

/**
 * Cross-org daily queue for the signed-in user:
 * assigned tickets, unassigned SLA breaches (staff), docs due for review,
 * expiries within 7 days, offline agents.
 */
export async function GET() {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getOrgScope(user.id, user.role);
  const isStaff = scope.mode === 'all';
  const orgWhere = scopeOrgWhere(scope);
  const now = new Date();
  const weekAhead = new Date(now.getTime() + EXPIRY_WINDOW_DAYS * 86400000);
  const agentCutoff = new Date(now.getTime() - AGENT_OFFLINE_HOURS * 3600000);

  const slaHours: Record<string, number> = { urgent: 1, high: 4, medium: 8, low: 24 };

  const [assigned, unassignedBreached, reviewsDue, domains, certs, renewals, servers] =
    await Promise.all([
      prisma.ticket.findMany({
        where: {
          assignedToUserId: user.id,
          status: { in: ['open', 'pending'] },
        },
        select: {
          id: true, subject: true, priority: true, status: true,
          createdAt: true, firstResponseAt: true, organization: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 25,
      }),
      isStaff
        ? prisma.ticket.findMany({
            where: {
              assignedToUserId: null,
              status: { in: ['open', 'pending'] },
            },
            select: {
              id: true, subject: true, priority: true, status: true,
              createdAt: true, firstResponseAt: true, organization: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 25,
          })
        : Promise.resolve([]),
      isStaff
        ? prisma.document.findMany({
            where: { userId: user.id, isArchived: false, reviewDate: { lte: now } },
            select: { id: true, title: true, reviewDate: true },
            orderBy: { reviewDate: 'asc' },
            take: 15,
          })
        : prisma.document.findMany({
            where: { ...orgWhere, isArchived: false, visibility: 'org', reviewDate: { lte: now } },
            select: { id: true, title: true, reviewDate: true },
            orderBy: { reviewDate: 'asc' },
            take: 15,
          }),
      prisma.domain.findMany({
        where: {
          ...(isStaff ? { userId: user.id } : orgWhere),
          expiresAt: { gte: now, lte: weekAhead },
        },
        select: { id: true, name: true, expiresAt: true },
        orderBy: { expiresAt: 'asc' },
      }),
      prisma.sslCertificate.findMany({
        where: {
          ...(isStaff ? { userId: user.id } : orgWhere),
          validTo: { gte: now, lte: weekAhead },
        },
        select: { id: true, hostname: true, validTo: true },
        orderBy: { validTo: 'asc' },
      }),
      prisma.renewalItem.findMany({
        where: {
          ...(isStaff ? { userId: user.id } : orgWhere),
          renewsAt: { gte: now, lte: weekAhead },
        },
        select: { id: true, name: true, vendor: true, totalCost: true, renewsAt: true },
        orderBy: { renewsAt: 'asc' },
      }),
      prisma.server.findMany({
        where: {
          ...(isStaff ? { userId: user.id } : orgWhere),
          lastHeartbeatAt: { lt: agentCutoff },
        },
        select: { id: true, name: true, lastHeartbeatAt: true },
        orderBy: { lastHeartbeatAt: 'asc' },
      }),
    ]);

  const ticketOut = (t: {
    id: number; subject: string; priority: string; status: string;
    createdAt: Date; firstResponseAt: Date | null;
    organization: { name: string } | null;
  }) => ({
    id: t.id,
    subject: t.subject,
    priority: t.priority,
    status: t.status,
    organizationName: t.organization?.name ?? null,
    ageHours: Math.floor((now.getTime() - t.createdAt.getTime()) / 3600000),
    slaBreached:
      !t.firstResponseAt &&
      (now.getTime() - t.createdAt.getTime()) / 3600000 > (slaHours[t.priority] ?? 8),
  });

  const daysLeft = (d: Date) => Math.ceil((d.getTime() - now.getTime()) / 86400000);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    ticketsAssigned: assigned.map(ticketOut),
    ticketsUnassignedBreached: (unassignedBreached as typeof assigned)
      .map(ticketOut)
      .filter((t) => t.slaBreached),
    reviewsDue: reviewsDue.map((d) => ({
      id: d.id,
      title: d.title,
      reviewDate: d.reviewDate?.toISOString() ?? null,
      daysOverdue: d.reviewDate
        ? Math.max(0, Math.floor((now.getTime() - d.reviewDate.getTime()) / 86400000))
        : null,
    })),
    expiringSoon: [
      ...domains
        .filter((d) => d.expiresAt)
        .map((d) => ({ kind: 'domain' as const, id: d.id, name: d.name, date: d.expiresAt!.toISOString(), daysLeft: daysLeft(d.expiresAt!) })),
      ...certs
        .filter((c) => c.validTo)
        .map((c) => ({ kind: 'ssl' as const, id: c.id, name: c.hostname, date: c.validTo!.toISOString(), daysLeft: daysLeft(c.validTo!) })),
      ...renewals.map((r) => ({
        kind: 'renewal' as const,
        id: r.id,
        name: r.name || r.vendor || 'Renewal',
        date: r.renewsAt.toISOString(),
        daysLeft: daysLeft(r.renewsAt),
        cost: r.totalCost ?? null,
      })),
    ].sort((a, b) => a.daysLeft - b.daysLeft),
    offlineAgents: servers.map((s) => ({
      id: s.id,
      name: s.name,
      hoursSilent: s.lastHeartbeatAt
        ? Math.floor((now.getTime() - s.lastHeartbeatAt.getTime()) / 3600000)
        : null,
    })),
  });
}
