import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { discoverOwnershipDestinations } from '@/lib/document-ownership-preview';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const url = new URL(request.url);
  try {
    const result = await discoverOwnershipDestinations(actor.id, id, url.searchParams.get('expectedUpdatedAt') || undefined,
      Number(url.searchParams.get('page') || 0), url.searchParams.get('q') || '');
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to load destination teams' }, { status: 500 });
  }
}
