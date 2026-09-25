import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { auditLog } from '@/lib/audit';
import { withDocumentWrite, snapshotDocument, nextDocumentTimestamp, DocumentWriteError } from '@/lib/document-write';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, revisionId } = await params;
  try {
    const result = await withDocumentWrite(id, user.id, req.headers.get('If-Unmodified-Since-Version') || undefined, async (tx, document) => {
      const revision = await tx.documentRevision.findFirst({ where: { id: revisionId, documentId: id, userId: user.id } });
      if (!revision) throw new DocumentWriteError(404, 'Revision not found');
      await snapshotDocument(tx, document, 'Saved before restore');
      const updated = await tx.document.update({ where: { id }, data: {
        title: revision.title, content: revision.content, category: revision.category, updatedAt: nextDocumentTimestamp(document),
      } });
      const latest = await tx.documentRevision.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' } });
      const restored = await tx.documentRevision.create({ data: {
        documentId: id, userId: user.id, title: updated.title, content: updated.content, category: updated.category,
        version: (latest?.version ?? 0) + 1, message: `Restored from revision v${revision.version}`,
      } });
      return { ...restored, updatedAt: updated.updatedAt };
    });
    auditLog({ userId: user.id, action: 'document.update', resourceType: 'document', resourceId: id, details: { restoredRevision: revisionId } }).catch(() => {});
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
