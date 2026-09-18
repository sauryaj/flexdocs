import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';
import { createNotification } from '@/lib/notifications';

/** Create a structured ticket from a service request template. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { templateId, organizationId, answers } = await req.json();
  if (!templateId || !organizationId) {
    return NextResponse.json({ error: 'templateId and organizationId required' }, { status: 400 });
  }

  const orgOk = await canAccessOrganization(user.id, user.role, organizationId);
  if (!orgOk) return NextResponse.json({ error: 'Forbidden: not a member' }, { status: 403 });

  const template = await prisma.serviceRequestTemplate.findFirst({
    where: { id: templateId, active: true, OR: [{ organizationId }, { organizationId: null }] },
  });
  if (!template) return NextResponse.json({ error: 'Request template not found or inactive' }, { status: 404 });

  const fields = JSON.parse(template.fields || '[]') as Array<{ key: string; label: string; type: string; required?: boolean }>;
  const values = (answers || {}) as Record<string, any>;

  const missing = fields.filter((f) => f.required && !String(values[f.key] ?? '').trim());
  if (missing.length) {
    return NextResponse.json({ error: `Missing required fields: ${missing.map((f) => f.label).join(', ')}` }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const body = [
    ...fields.map(
      (f) =>
        `**${f.label}**${f.type === 'boolean' ? (values[f.key] ? ' Yes' : ' No') : `: ${String(values[f.key] ?? '')}`}`
    ),
    '',
    `Submitted by ${user.name || user.email}`,
  ].join('\n');

  const ticket = await prisma.ticket.create({
    data: {
      subject: `${template.name}${org ? ` — ${org.name}` : ''}`,
      description: body.trim(),
      priority: template.priority,
      organizationId,
      createdByUserId: user.id,
    },
  });

  if (user.role !== 'admin' && user.role !== 'editor') {
    try {
      const staff = await prisma.user.findMany({
        where: { role: { in: ['admin', 'editor'] } },
        select: { id: true },
      });
      for (const s of staff) {
        await createNotification({
          userId: s.id,
          type: 'system',
          title: 'Service request received',
          message: `${user.name || user.email} requested "${template.name}"${org ? ` (${org.name})` : ''}`,
          severity: 'info',
          link: `/dashboard/tickets/${ticket.id}`,
        });
      }
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ ticketId: ticket.id, subject: ticket.subject }, { status: 201 });
}