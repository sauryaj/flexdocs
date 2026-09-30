import { DocumentWriteError } from '@/lib/document-write';
import { createDocument, creationKeySchema, documentCreateSchema } from '@/lib/document-create';
import { auditLog } from '@/lib/audit';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';
import { discoverDocuments } from '@/lib/document-discovery';
import { discoverDocumentTrash } from '@/lib/document-trash';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId') || undefined;
  const page = Math.min(1_000_000, Math.max(0, parseInt(url.searchParams.get('page') || '0') || 0));
  const limit = Math.min(100, Math.max(1, (parseInt(url.searchParams.get('limit') || '50') || 50)));

  const trash = url.searchParams.get('trash') === 'true';
  const query = url.searchParams.get('q')?.trim() || '';
  if (query.length > 500) return NextResponse.json({ error: 'Search is limited to 500 characters' }, { status: 400 });
  const category = url.searchParams.get('category');
  const folderId = url.searchParams.get('folderId');
  try {
    return NextResponse.json(await (trash ? discoverDocumentTrash : discoverDocuments)(user.id, { query, organizationId, category, folderId,
      excludeArchived: url.searchParams.get('archived') === 'false', page, limit }));
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const expectedUser = req.headers.get('X-Expected-User-Id');
  if (expectedUser !== null && expectedUser !== user.id) return NextResponse.json({ error: 'Your account changed. Reload before saving this document.' }, { status: 409 });
  if (!hasPermission(user.role as UserRole, 'document.create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const key = req.headers.get('Idempotency-Key');
  if (key !== null && !creationKeySchema.safeParse(key).success) return NextResponse.json({ error: 'Idempotency-Key must be a UUID' }, { status: 400 });
  const parsed = documentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid document', details: parsed.error.flatten() }, { status: 400 });
  try {
    const { document, replayed } = await createDocument(user.id, user.role as UserRole, parsed.data, key || undefined);
    if (!replayed) auditLog({ userId: user.id, action: 'document.create', resourceType: 'document', resourceId: document.id, resourceName: document.title }).catch(() => {});
    return NextResponse.json(document, { status: replayed ? 200 : 201, headers: { 'Idempotency-Replayed': String(replayed) } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
