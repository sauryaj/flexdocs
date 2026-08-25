import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canAccessOrganization } from '@/lib/org-scope';

/** GET /api/locations?organizationId= — org-scoped location list. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const organizationId = new URL(req.url).searchParams.get('organizationId') || undefined;
  const locations = await prisma.location.findMany({
    where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(locations);
}

/** POST /api/locations — create. Org-linked locations require org access. */
export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, address, city, state, country, notes, organizationId } = await req.json().catch(() => ({}));
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (organizationId && !(await canAccessOrganization(user.id, user.role, organizationId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const location = await prisma.location.create({
    data: {
      name: name.trim(),
      address: address || null,
      city: city || null,
      state: state || null,
      country: country || null,
      notes: notes || null,
      organizationId: organizationId || null,
      userId: user.id,
    },
  });
  return NextResponse.json(location, { status: 201 });
}
