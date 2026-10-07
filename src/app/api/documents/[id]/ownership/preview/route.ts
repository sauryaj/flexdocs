import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { previewDocumentOwnership } from '@/lib/document-ownership-preview';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await auth();
  if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(actor.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = z.object({ destinationOrganizationId: z.string().min(1).max(200), expectedUpdatedAt: z.string().datetime().optional(),
    page: z.coerce.number().int().min(0).max(1_000_000).optional() }).strict().safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid ownership preview parameters' }, { status: 400 });
  const { id } = await params;
  try {
    return NextResponse.json(await previewDocumentOwnership(actor.id, id, parsed.data.destinationOrganizationId, parsed.data.expectedUpdatedAt, parsed.data.page),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to load ownership preview. Try again.' }, { status: 500 });
  }
}
