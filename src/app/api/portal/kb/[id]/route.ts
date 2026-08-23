import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrgScope, canAccessOrganization } from '@/lib/org-scope';

/** Client-safe knowledge-base article: must be visibility=org AND inside member orgs. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      title: true,
      content: true,
      updatedAt: true,
      visibility: true,
      organizationId: true,
    },
  });
  if (!doc || doc.visibility !== 'org' || !doc.organizationId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!(await canAccessOrganization(user.id, user.role, doc.organizationId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    id,
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt.toISOString(),
  });
}
