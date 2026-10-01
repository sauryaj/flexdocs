import { NextResponse } from 'next/server';
import { resolve } from 'node:path';
import { auth } from '@/lib/auth';
import { readReviewedFile } from '@/lib/document-review-read';
import { LocalImmutableFileStore } from '@/lib/immutable-file-store';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(_request: Request, { params }: {
  params: Promise<{ id: string; reviewId: string; attachmentId: string }>;
}) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, reviewId, attachmentId } = await params;
  try {
    const file = await readReviewedFile(user.id, id, reviewId, attachmentId, new LocalImmutableFileStore(resolve(process.env.UPLOAD_DIR || 'uploads')));
    const filename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
    const mimeType = /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(file.mimeType) ? file.mimeType : 'application/octet-stream';
    return new NextResponse(new Uint8Array(file.bytes), { headers: {
      'Content-Type': mimeType, 'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(file.bytes.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    throw error;
  }
}
