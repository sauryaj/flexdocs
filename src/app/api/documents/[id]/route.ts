import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';
import { documentUpdateSchema, DocumentWriteError } from '@/lib/document-write';
import { updateDocument } from '@/lib/document-update';
import { readDocumentDetail } from '@/lib/document-detail-read';
import { documentCapabilities } from '@/lib/document-capabilities';
import { type UserRole } from '@prisma/client';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    return NextResponse.json(await readDocumentDetail(user.id, id));
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'document.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const parsed = documentUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid document', details: parsed.error.flatten() }, { status: 400 });
  try {
    const updated = await updateDocument(user.id, id, parsed.data);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(user.role as UserRole, 'document.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { deletedAt: null, id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!documentCapabilities(document, { id: user.id, role: user.role }).manageLifecycle) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (document.lifecycleState !== null || document.ownershipKind === 'organization') return NextResponse.json({ error: 'Use a dedicated lifecycle action for this document' }, { status: 409 });

  await prisma.document.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
  auditLog({ userId: user.id, action: 'document.delete', resourceType: 'document', resourceId: id, resourceName: document.title }).catch(() => {});

  return NextResponse.json({ message: 'Moved to trash' });
}
