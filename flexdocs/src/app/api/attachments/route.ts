import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { storeFile } from '@/lib/file-storage';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');

  const where: Record<string, string> = { userId: user.id };
  if (documentId) where.documentId = documentId;

  const attachments = await prisma.attachment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
  });

  return NextResponse.json(attachments);
}

export async function POST(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { filename, mimeType, size, data, documentId } = await req.json();

  if (!filename || !mimeType || !data) {
    return NextResponse.json(
      { error: 'filename, mimeType, and data are required' },
      { status: 400 }
    );
  }

  const attachment = await storeFile(data, filename, mimeType, size || 0, user.id, documentId);
  return NextResponse.json(attachment, { status: 201 });
}
