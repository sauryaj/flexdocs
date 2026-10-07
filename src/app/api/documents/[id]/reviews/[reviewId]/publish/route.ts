import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import { publishDocumentReview } from '@/lib/document-publication';
import { LocalImmutableFileStore } from '@/lib/immutable-file-store';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, reviewId } = await params;
  try {
    const { snapshot, replayed } = await publishDocumentReview(user.id, reviewId, new LocalImmutableFileStore(resolve(process.env.UPLOAD_DIR || './uploads')), id);
    return NextResponse.json({ snapshotId: snapshot.id, documentId: snapshot.documentId, publishedAt: snapshot.publishedAt, replayed }, { status: replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
