import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import { restoreDocumentRevision } from '@/lib/document-history';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, revisionId } = await params;
  try {
    const result = await restoreDocumentRevision(user.id, id, revisionId, req.headers.get('If-Unmodified-Since-Version') || undefined);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
