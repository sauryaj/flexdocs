import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { AttachmentUploadError, parseMultipartAttachment } from '@/lib/attachment-upload';
import { listTeamDocumentFiles, uploadTeamDocumentFile } from '@/lib/team-document-files';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try { return NextResponse.json(await listTeamDocumentFiles(actor.id, id, Number(new URL(request.url).searchParams.get('page'))), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch (error) { if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const version = request.headers.get('X-Document-Version');
  if (!version) return NextResponse.json({ error: 'Reload and provide the current document version' }, { status: 428 });
  if (!z.string().datetime().safeParse(version).success) return NextResponse.json({ error: 'Invalid document version' }, { status: 400 });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return NextResponse.json({ error: 'Use multipart/form-data' }, { status: 415 });
  try {
    const file = await parseMultipartAttachment(request);
    if (file.documentId && file.documentId !== id) return NextResponse.json({ error: 'Document path does not match upload' }, { status: 400 });
    if (request.signal.aborted) return NextResponse.json({ error: 'Upload interrupted' }, { status: 400 });
    return NextResponse.json(await uploadTeamDocumentFile(actor.id, id, version, { bytes: file.buffer, filename: file.filename, mimeType: file.mimeType }), { status: 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError || error instanceof AttachmentUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Upload could not be confirmed. Refresh the document and files before retrying.' }, { status: 500 });
  }
}
