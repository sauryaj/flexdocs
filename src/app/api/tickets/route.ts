import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgScope, scopeOrgWhere, canAccessOrganization } from '@/lib/org-scope';
import { createNotification } from '@/lib/notifications';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const status = url.searchParams.get('status') || undefined;

  const scope = await getOrgScope(user.id, user.role);
  let where: Record<string, unknown>;
  if (scope.mode === 'limited') {
    // Clients see their own org's tickets AND any ticket they filed, even without membership
    const orgs = scopeOrgWhere(scope, organizationId).organizationId;
    where = {
      OR: [
        { createdByUserId: user.id },
        { organizationId: orgs ?? { in: ['__none__'] } },
      ],
      ...(status ? { status } : {}),
    };
  } else {
    where = {
      ...(organizationId ? { organizationId } : {}),
      ...(status ? { status } : {}),
    };
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { replies: true } },
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take: 200,
  });

  const priorityRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
  tickets.sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0));

  // SLA targets (hours) for first response
  const slaHours: Record<string, number> = { urgent: 1, high: 4, medium: 8, low: 24 };
  const now = Date.now();

  return NextResponse.json(
    tickets.map((t) => {
      const target = slaHours[t.priority] ?? 8;
      const ageH = (now - t.createdAt.getTime()) / 3600000;
      const slaBreached =
        !t.firstResponseAt && ageH > target && (t.status === 'open' || t.status === 'pending');
      return {
        ...t,
        createdByName: t.createdBy.name || t.createdBy.email,
        replyCount: t._count.replies,
        firstResponseAt: t.firstResponseAt?.toISOString() || null,
        slaBreached,
        _count: undefined,
      };
    }),
  );
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subject, description, priority, organizationId } = await req.json().catch(() => ({}));
  if (!subject?.trim() || !description?.trim()) {
    return NextResponse.json({ error: 'subject and description required' }, { status: 400 });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: `priority must be one of ${PRIORITIES.join(', ')}` }, { status: 400 });
  }

  // Non-staff may only file against organizations they actually belong to
  const scope = await getOrgScope(user.id, user.role);
  if (scope.mode === 'limited' && organizationId) {
    const allowed = await canAccessOrganization(user.id, user.role, organizationId);
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden: not a member of this organization' }, { status: 403 });
    }
  }

  const ticket = await prisma.ticket.create({
    data: {
      subject: subject.trim(),
      description: description.trim(),
      priority: priority || 'medium',
      organizationId: organizationId || null,
      createdByUserId: user.id,
    },
    include: { organization: { select: { name: true } } },
  });

  // Notify staff (admins + editors) that a new ticket arrived
  if (!['admin', 'editor'].includes(user.role)) {
    try {
      const staff = await prisma.user.findMany({
        where: { role: { in: ['admin', 'editor'] } },
        select: { id: true },
      });
      for (const s of staff) {
        await createNotification({
          userId: s.id,
          type: 'system',
          title: 'New support ticket',
          message: `${user.name || user.email} opened "${ticket.subject}"${ticket.organization ? ` (${ticket.organization.name})` : ''}`,
          severity: priority === 'urgent' ? 'danger' : 'info',
          link: `/dashboard/tickets/${ticket.id}`,
        });
      }
    } catch {
      // notification failures never block ticket creation
    }
  }

  return NextResponse.json({ ...ticket, createdByName: user.name || user.email }, { status: 201 });
}
