import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAttachmentData, deleteFile } from '@/lib/file-storage';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';
import { DocumentWriteError } from '@/lib/document-write';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const attachment = await getAttachmentData(id, user.id);
  if (!attachment || attachment.data === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = Buffer.from(attachment.data, 'base64');
  const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!hasPermission(user.role as UserRole, 'document.delete')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const deleted = await deleteFile(id, user.id);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, cleanupPending: deleted.cleanupPending, bytesRetained: deleted.bytesRetained });
  } catch (error) {
    if (error instanceof DocumentWriteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Removal could not be confirmed. Refresh attachments before retrying.' }, { status: 500 });
  }
}
