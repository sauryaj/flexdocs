import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';
import { documentUpdateSchema, withDocumentWrite, snapshotDocument, nextDocumentTimestamp, DocumentWriteError, validateDocumentFolder } from '@/lib/document-write';
import { documentReadWhere } from '@/lib/document-access';
import { documentCapabilities } from '@/lib/document-capabilities';
import { getOrgScope } from '@/lib/org-scope';
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
  const scope = await getOrgScope(user.id, user.role);
  const document = await prisma.document.findFirst({
    where: { deletedAt: null, id, ...documentReadWhere(user.id, scope) },
    include: { tags: true, folder: true },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ...document, canEdit: documentCapabilities(document, { id: user.id, role: user.role }).edit });
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
  const { expectedUpdatedAt, tags, reviewDate, reviewAcknowledged, ...fields } = parsed.data;
  try {
    const updated = await withDocumentWrite(id, user.id, expectedUpdatedAt, async (tx, document) => {
      if (!documentCapabilities(document, { id: user.id, role: user.role }).edit) throw new DocumentWriteError(404, 'Not found');
      await validateDocumentFolder(tx, user.id, document.organizationId, fields.folderId);
      if ((fields.content !== undefined && fields.content !== document.content) ||
          (fields.title !== undefined && fields.title !== document.title) ||
          (fields.category !== undefined && fields.category !== document.category)) {
        await snapshotDocument(tx, document, 'Saved before overwrite');
      }
      return tx.document.update({
        where: { id },
        data: {
          ...fields,
          updatedAt: nextDocumentTimestamp(document),
          ...(fields.folderId !== undefined ? { folderId: fields.folderId || null } : {}),
          ...(fields.visibility !== undefined ? { visibility: fields.visibility === 'org' && document.organizationId ? 'org' : 'private' } : {}),
          ...(reviewDate !== undefined ? { reviewDate: reviewDate ? new Date(reviewDate) : null } : {}),
          ...(reviewAcknowledged ? { lastReviewedAt: new Date() } : {}),
          ...(tags !== undefined ? { tags: {
            set: [],
            connectOrCreate: tags.map(name => ({ where: { name_userId: { name, userId: user.id } }, create: { name, userId: user.id } })),
          } } : {}),
        },
        include: { tags: true, folder: true },
      });
    });
    auditLog({ userId: user.id, action: 'document.update', resourceType: 'document', resourceId: id,
      resourceName: updated.title, details: { fields: Object.keys(parsed.data).filter(k => k !== 'expectedUpdatedAt') } }).catch(() => {});
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

  await prisma.document.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
  auditLog({ userId: user.id, action: 'document.delete', resourceType: 'document', resourceId: id, resourceName: document.title }).catch(() => {});

  return NextResponse.json({ message: 'Moved to trash' });
}
