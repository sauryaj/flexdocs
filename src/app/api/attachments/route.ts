import { z } from 'zod';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { storeFile } from '@/lib/file-storage';
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
  if (!hasPermission(user.role as UserRole, 'document.update')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = z.object({
    filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(255),
    data: z.string().min(1).max(14_000_000), size: z.number().nonnegative().optional(),
    documentId: z.string().nullable().optional(),
  }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid attachment (maximum encoded size: 14 MB)' }, { status: 400 });
  const { filename, mimeType, size, data, documentId } = parsed.data;

  if (documentId && (typeof documentId !== 'string' || !await prisma.document.findFirst({ where: { id: documentId, userId: user.id } }))) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const attachment = await storeFile(data, filename, mimeType, size || 0, user.id, documentId || undefined);
  return NextResponse.json(attachment, { status: 201 });
}
