import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolve } from 'node:path';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import { submitDocumentReview } from '@/lib/document-review';
import { documentReviewDto, readDocumentReviews } from '@/lib/document-review-read';
import { LocalImmutableFileStore } from '@/lib/immutable-file-store';

const identifier = z.string().min(1).max(128);
const submission = z.object({ expectedUpdatedAt: z.string().datetime(), reviewerIds: z.array(identifier).min(1).max(10),
  attachmentIds: z.array(identifier).max(10).default([]) }).strict();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json(await readDocumentReviews(user.id, id, Number(new URL(request.url).searchParams.get('page'))), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const input = submission.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid review submission' }, { status: 400 });
  const { id } = await params;
  const uploadRoot = resolve(process.env.UPLOAD_DIR || './uploads');
  try {
    const review = await submitDocumentReview(user.id, id, input.data.expectedUpdatedAt, input.data.reviewerIds,
      { attachmentIds: input.data.attachmentIds, storage: new LocalImmutableFileStore(uploadRoot), uploadRoot });
    return NextResponse.json(documentReviewDto(review), { status: 201 });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
