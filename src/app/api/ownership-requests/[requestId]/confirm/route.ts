import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { confirmDocumentOwnershipRequest } from '@/lib/document-ownership-execution';
import { DocumentWriteError } from '@/lib/document-write';
import { readBoundedBody, AttachmentUploadError } from '@/lib/attachment-upload';

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { requestId } = await params;
  try {
    const bytes = await readBoundedBody(request, 4096);
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const result = await confirmDocumentOwnershipRequest(actor.id, requestId, input);
    return NextResponse.json(result.request, { headers: { 'Cache-Control': 'private, no-store', 'Idempotency-Replayed': String(result.replayed) } });
  } catch (error) {
    if (error instanceof DocumentWriteError || error instanceof AttachmentUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Ownership change could not be confirmed. Check the request status and retry the same confirmation.' }, { status: 500 });
  }
}
