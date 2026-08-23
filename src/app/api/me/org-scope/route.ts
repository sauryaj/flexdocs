import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOrgScope, canAccessOrganization } from '@/lib/org-scope';
import { prisma } from '@/lib/prisma';

/** Scope info used by the sidebar/portal to render the right navigation. */
export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scope = await getOrgScope(user.id, user.role);
  if (scope.mode === 'all') {
    return NextResponse.json({ mode: 'all', orgIds: [] });
  }

  const orgs = await prisma.organization.findMany({
    where: scope.orgIds.length > 0 ? { id: { in: scope.orgIds } } : { id: '__none__' },
    select: { id: true, name: true },
  });

  const url = new URL(req.url);
  const check = url.searchParams.get('canAccess');
  if (check) {
    return NextResponse.json({
      mode: 'limited',
      orgs,
      canAccess: await canAccessOrganization(user.id, user.role, check),
    });
  }

  return NextResponse.json({ mode: 'limited', orgs });
}
