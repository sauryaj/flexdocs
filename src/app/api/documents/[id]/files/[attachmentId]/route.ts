import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { deleteTeamDocumentFile, readTeamDocumentFile } from '@/lib/team-document-files';
import { DocumentWriteError } from '@/lib/document-write';
import { readBoundedBody, AttachmentUploadError } from '@/lib/attachment-upload';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, attachmentId } = await params;
  try {
    const file = await readTeamDocumentFile(actor.id, id, attachmentId);
    return new NextResponse(new Uint8Array(file.bytes), { headers: { 'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`, 'Content-Length': String(file.bytes.length),
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id, attachmentId } = await params;
  try {
    const bytes = await readBoundedBody(request, 4096);
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const parsed = z.object({ expectedUpdatedAt: z.string().datetime() }).strict().safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: 'Provide only expectedUpdatedAt' }, { status: 400 });
    return NextResponse.json(await deleteTeamDocumentFile(actor.id, id, attachmentId, parsed.data.expectedUpdatedAt));
  } catch (error) {
    if (error instanceof DocumentWriteError || error instanceof AttachmentUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Deletion could not be confirmed. Refresh the document and files before retrying.' }, { status: 500 });
  }
}
