import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { DocumentWriteError } from '@/lib/document-write';
import { decideDocumentReview } from '@/lib/document-review';
import { documentReviewDto } from '@/lib/document-review-read';

const decisionSchema = z.object({ decision: z.enum(['approved', 'rejected', 'withdrawn']), feedback: z.string().max(10_000).optional() }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role, 'document.update')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const input = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid review decision' }, { status: 400 });
  const { id, reviewId } = await params;
  try {
    return NextResponse.json(documentReviewDto(await decideDocumentReview(user.id, reviewId, input.data.decision, input.data.feedback, id)));
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
