import { z } from 'zod';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { storeFile, storeFileBytes } from '@/lib/file-storage';
import { AttachmentUploadError, parseMultipartAttachment, parseLegacyAttachmentBody } from '@/lib/attachment-upload';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { type UserRole } from '@prisma/client';

export async function GET(req: Request) {
  const user = await auth();
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const documentId = searchParams.get('documentId');

  const where: Record<string, string> = { userId: user.id };
  if (documentId) where.documentId = documentId;

  const attachments = await prisma.attachment.findMany({
    where: { ...where, OR: [{ documentId: null }, { document: { deletedAt: null, ownershipKind: 'personal' } }] },
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
  if (!hasPermission(user.role as UserRole, 'document.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    try {
      const { buffer, filename, mimeType, documentId } = await parseMultipartAttachment(req);
      if (documentId && !await prisma.document.findFirst({ where: { id: documentId, userId: user.id, deletedAt: null, ownershipKind: 'personal' } })) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      if (req.signal.aborted) return NextResponse.json({ error: 'Upload interrupted' }, { status: 400 });
      const attachment = await storeFileBytes(buffer, filename, mimeType, user.id, documentId);
      return NextResponse.json({ id: attachment.id, filename, mimeType, size: attachment.size, createdAt: attachment.createdAt }, { status: 201 });
    } catch (error) {
      if (error instanceof AttachmentUploadError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: 'Upload could not be confirmed. Refresh attachments before retrying.' }, { status: 500 });
    }
  }

  let body: unknown;
  try { body = await parseLegacyAttachmentBody(req); }
  catch (error) {
    return NextResponse.json({ error: error instanceof AttachmentUploadError ? error.message : 'Upload interrupted' }, { status: error instanceof AttachmentUploadError ? error.status : 400 });
  }
  const parsed = z.object({
    filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(255),
    data: z.string().min(1).max(14_000_000), size: z.number().nonnegative().optional(),
    documentId: z.string().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid attachment (maximum encoded size: 14 MB)' }, { status: 400 });
  const { filename, mimeType, size, data, documentId } = parsed.data;

  if (documentId && (typeof documentId !== 'string' || !await prisma.document.findFirst({ where: { deletedAt: null, id: documentId, userId: user.id, ownershipKind: 'personal' } }))) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const attachment = await storeFile(data, filename, mimeType, size || 0, user.id, documentId || undefined);
  return NextResponse.json(attachment, { status: 201 });
}
