import { hasPermission } from '@/lib/rbac';
import { revisionSchema, DocumentWriteError } from '@/lib/document-write';
import { readDocumentHistory, createDocumentRevision } from '@/lib/document-history';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try { return NextResponse.json(await readDocumentHistory(user.id, id)); }
  catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = revisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid revision' }, { status: 400 });
  const { id } = await params;
  try {
    const result = await createDocumentRevision(user.id, id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
