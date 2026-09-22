import { hasPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';
import { revisionSchema, withDocumentWrite, snapshotDocument, nextDocumentTimestamp, DocumentWriteError } from '@/lib/document-write';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
  });

  if (!document) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const revisions = await prisma.documentRevision.findMany({
    where: { documentId: id, userId: user.id },
    orderBy: { version: 'desc' },
  });

  return NextResponse.json(revisions);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = revisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid revision' }, { status: 400 });
  const { id } = await params;
  const { expectedUpdatedAt, message, ...fields } = parsed.data;
  try {
    const result = await withDocumentWrite(id, user.id, expectedUpdatedAt, async (tx, document) => {
      await snapshotDocument(tx, document, 'Saved before revision');
      const updated = await tx.document.update({ where: { id }, data: { ...fields, updatedAt: nextDocumentTimestamp(document) } });
      const latest = await tx.documentRevision.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' } });
      const revision = await tx.documentRevision.create({ data: {
        documentId: id, userId: user.id, title: updated.title, content: updated.content, category: updated.category,
        version: (latest?.version ?? 0) + 1, message: message || null,
      } });
      return { ...revision, updatedAt: updated.updatedAt };
    });
    auditLog({ userId: user.id, action: 'document.update', resourceType: 'document', resourceId: id, details: { revision: result.version } }).catch(() => {});
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
