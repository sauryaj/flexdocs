import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';

/** GET /api/contacts?organizationId= — org-scoped contact list. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get('organizationId') || undefined;
  const contacts = await prisma.contact.findMany({
    where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(contacts);
}

/** POST /api/contacts — create. Org-linked contacts require org access. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, title, email, phone, mobile, notes, organizationId } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (organizationId && !(await canAccessOrganization(user.id, user.role, organizationId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const contact = await prisma.contact.create({
    data: {
      name: name.trim(),
      title: title || null,
      email: email || null,
      phone: phone || null,
      mobile: mobile || null,
      notes: notes || null,
      organizationId: organizationId || null,
      userId: user.id,
    },
  });
  return NextResponse.json(contact, { status: 201 });
}
