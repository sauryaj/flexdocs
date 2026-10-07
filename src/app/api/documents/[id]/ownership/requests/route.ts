import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { prepareDocumentOwnershipRequest } from '@/lib/document-ownership-requests';
import { DocumentWriteError } from '@/lib/document-write';
import { readBoundedBody, AttachmentUploadError } from '@/lib/attachment-upload';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    const bytes = await readBoundedBody(request, 4096);
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const result = await prepareDocumentOwnershipRequest(actor.id, id, input);
    return NextResponse.json(result.request, { status: result.replayed ? 200 : 201,
      headers: { 'Cache-Control': 'private, no-store', 'Idempotency-Replayed': String(result.replayed) } });
  } catch (error) {
    if (error instanceof DocumentWriteError || error instanceof AttachmentUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Ownership request could not be confirmed. Retry the same key and preview.' }, { status: 500 });
  }
}
