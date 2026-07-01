import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAttachmentData, deleteFile } from '@/lib/file-storage';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const attachment = await getAttachmentData(id, user.id);
  if (!attachment || !attachment.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = Buffer.from(attachment.data, 'base64');
  const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': attachment.mimeType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(buffer.length),
    },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deleted = await deleteFile(id, user.id);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
