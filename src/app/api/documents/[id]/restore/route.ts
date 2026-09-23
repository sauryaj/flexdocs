import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const result = await prisma.document.updateMany({
    where: { id, userId: user.id, deletedAt: { not: null } },
    // Restoring privately avoids immediately republishing a previously shared article.
    data: { deletedAt: null, visibility: 'private' },
  });
  if (!result.count) return NextResponse.json({ error: 'Trashed document not found' }, { status: 404 });
  auditLog({ userId: user.id, action: 'document.restore', resourceType: 'document', resourceId: id }).catch(() => {});
  return NextResponse.json({ message: 'Document restored privately' });
}
