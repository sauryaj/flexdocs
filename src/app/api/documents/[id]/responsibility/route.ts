import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { discoverDocumentMaintainers, reassignDocumentMaintainer } from '@/lib/document-responsibility';
import { DocumentWriteError } from '@/lib/document-write';
import { readBoundedBody, AttachmentUploadError } from '@/lib/attachment-upload';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const url = new URL(request.url);
  try {
    return NextResponse.json(await discoverDocumentMaintainers(actor.id, id, { page: Number(url.searchParams.get('page')), query: url.searchParams.get('q') || '' }),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    const bytes = await readBoundedBody(request, 4096);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const input = z.object({ responsibleUserId: z.string().min(1).max(200).nullable(), expectedUpdatedAt: z.string().datetime().optional() }).strict().safeParse(body);
    if (!input.success) return NextResponse.json({ error: 'Provide responsibleUserId and the current expectedUpdatedAt' }, { status: 400 });
    return NextResponse.json(await reassignDocumentMaintainer(actor.id, id, input.data.responsibleUserId, input.data.expectedUpdatedAt),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError || error instanceof AttachmentUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Reassignment could not be confirmed. Reload the document before retrying.' }, { status: 500 });
  }
}
