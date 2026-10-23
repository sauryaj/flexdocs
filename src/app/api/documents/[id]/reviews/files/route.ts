import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { discoverReviewFiles } from '@/lib/document-review-files';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try { return NextResponse.json(await discoverReviewFiles(user.id, id, Number(new URL(request.url).searchParams.get('page'))), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
