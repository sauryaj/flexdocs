import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';
import { createNotification } from '@/lib/notifications';

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

async function loadTicketForUser(id: number, userId: string, role?: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!ticket) return null;
  const isStaff = role === 'admin' || role === 'editor';
  if (isStaff || ticket.createdByUserId === userId) return { ticket, isStaff };
  if (ticket.organizationId && (await canAccessOrganization(userId, role, ticket.organizationId))) {
    return { ticket, isStaff };
  }
  return null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const loaded = await loadTicketForUser(parseInt(id), user.id, user.role);
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { ticket, isStaff } = loaded;

  const replies = await prisma.ticketReply.findMany({
    where: { ticketId: ticket.id, ...(isStaff ? {} : { internal: false }) },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    ...ticket,
    createdByName: ticket.createdBy.name || ticket.createdBy.email,
    replies: replies.map((r) => ({
      id: r.id,
      body: r.body,
      internal: r.internal,
      createdAt: r.createdAt.toISOString(),
      userName: r.user.name || r.user.email,
      isSelf: r.userId === user.id,
    })),
  });
}

/** Staff reply / client reply. Internal notes are staff-only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const loaded = await loadTicketForUser(parseInt(id), user.id, user.role);
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { ticket, isStaff } = loaded;
  if (ticket.status === 'closed') {
    return NextResponse.json({ error: 'Ticket is closed' }, { status: 400 });
  }

  const { body, internal } = await req.json().catch(() => ({}));
  if (!body?.trim()) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: ticket.id,
      userId: user.id,
      body: body.trim(),
      internal: isStaff ? !!internal : false,
    },
  });

  // Keep the conversation moving: bump to pending when staff reply, back to open when client does
  const newStatus =
    ticket.status !== 'resolved' && ticket.status !== 'closed'
      ? isStaff
        ? 'pending'
        : 'open'
      : undefined;
  if (newStatus) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: newStatus } });
  }

  // Notify the counterpart
  try {
    const notifyUserId =
      user.id === ticket.createdByUserId ? ticket.assignedToUserId : ticket.createdByUserId;
    if (notifyUserId && notifyUserId !== user.id) {
      await createNotification({
        userId: notifyUserId,
        type: 'system',
        title: `Ticket update: ${ticket.subject}`,
        message: `${user.name || user.email} replied${internal ? ' (internal note)' : ''}.`,
        severity: 'info',
        link: isStaff ? `/dashboard/tickets/${ticket.id}` : `/dashboard/portal/tickets/${ticket.id}`,
      });
    }
  } catch {
    // never block on notifications
  }

  return NextResponse.json(
    {
      ok: true,
      replyId: reply.id,
      status: newStatus || ticket.status,
      createdAt: reply.createdAt.toISOString(),
    },
    { status: 201 },
  );
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const loaded = await loadTicketForUser(parseInt(id), user.id, user.role);
  if (!loaded) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { ticket, isStaff } = loaded;

  const { status, priority, assignedToUserId } = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};

  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
    }
    // Creators may only close/reopen their own tickets; staff can set anything
    if (isStaff || ticket.createdByUserId === user.id) {
      if (!isStaff && status !== 'closed' && status !== 'open') {
        return NextResponse.json({ error: 'Clients may only close or reopen tickets' }, { status: 403 });
      }
      data.status = status;
      data.resolvedAt = status === 'resolved' || status === 'closed' ? new Date() : null;
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (isStaff) {
    if (priority !== undefined) {
      if (!PRIORITIES.includes(priority)) {
        return NextResponse.json({ error: `priority must be one of ${PRIORITIES.join(', ')}` }, { status: 400 });
      }
      data.priority = priority;
    }
    if (assignedToUserId !== undefined) {
      data.assignedToUserId = assignedToUserId || null;
    }
  } else if (priority !== undefined || assignedToUserId !== undefined) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data,
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  // Notify the counterpart about status changes
  if (status !== undefined) {
    try {
      const notifyUserId =
        user.id === ticket.createdByUserId ? ticket.assignedToUserId : ticket.createdByUserId;
      if (notifyUserId && notifyUserId !== user.id) {
        await createNotification({
          userId: notifyUserId,
          type: 'system',
          title: `Ticket ${status}: ${ticket.subject}`,
          message: `Status changed to "${status}".`,
          severity: status === 'resolved' ? 'success' : 'info',
          link: isStaff ? `/dashboard/tickets/${ticket.id}` : `/dashboard/portal/tickets/${ticket.id}`,
        });
      }
    } catch {
      // never block on notifications
    }
  }

  return NextResponse.json({
    ok: true,
    status: updated.status,
    priority: updated.priority,
    assignedTo: updated.assignedTo ? { id: updated.assignedTo.id, name: updated.assignedTo.name } : null,
  });
}
