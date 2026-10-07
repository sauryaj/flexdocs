import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readDocumentOwnershipRequest, cancelDocumentOwnershipRequest } from '@/lib/document-ownership-requests';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { requestId } = await params;
  try {
    return NextResponse.json(await readDocumentOwnershipRequest(actor.id, requestId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to read ownership request status. Try again.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  // Requesters must be able to withdraw their own pending request even after losing team write access.
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { requestId } = await params;
  try {
    return NextResponse.json(await cancelDocumentOwnershipRequest(actor.id, requestId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Cancellation could not be confirmed. Reload your request status before retrying.' }, { status: 500 });
  }
}
