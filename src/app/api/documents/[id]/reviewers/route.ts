import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { discoverDocumentReviewers } from '@/lib/document-reviewers';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const url = new URL(request.url);
  try {
    return NextResponse.json(await discoverDocumentReviewers(user.id, id, { page: Number(url.searchParams.get('page')), query: url.searchParams.get('q') || '' }),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
