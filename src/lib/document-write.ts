import { Prisma, type Document } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const documentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  content: z.string().max(2_000_000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  folderId: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).transform(v => [...new Set(v)]).optional(),
  reviewDate: z.string().refine(v => !v || !Number.isNaN(Date.parse(v)), 'Invalid review date').nullable().optional(),
  reviewAcknowledged: z.boolean().optional(),
  visibility: z.enum(['private', 'org']).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const revisionSchema = documentUpdateSchema.pick({ title: true, content: true, category: true, expectedUpdatedAt: true }).extend({
  message: z.string().max(1000).nullable().optional(),
});

export class DocumentWriteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function withDocumentWrite<T>(
  id: string,
  userId: string,
  expectedUpdatedAt: string | undefined,
  write: (tx: Prisma.TransactionClient, document: Document) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async tx => {
    // All revision writers lock the parent first so version allocation and snapshots are serialized.
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
    const document = await tx.document.findFirst({ where: { id, userId } });
    if (!document) throw new DocumentWriteError(404, 'Document not found');
    if (expectedUpdatedAt && document.updatedAt.toISOString() !== expectedUpdatedAt) {
      throw new DocumentWriteError(409, 'This document changed since you loaded it. Copy your edits before reloading to compare the latest version.');
    }
    return write(tx, document);
  });
}

export async function snapshotDocument(tx: Prisma.TransactionClient, document: Document, message: string) {
  const latest = await tx.documentRevision.findFirst({ where: { documentId: document.id }, orderBy: { version: 'desc' } });
  if (latest && latest.title === document.title && latest.content === document.content && latest.category === document.category) return latest;
  return tx.documentRevision.create({ data: {
    documentId: document.id, userId: document.userId,
    title: document.title, content: document.content, category: document.category,
    version: (latest?.version ?? 0) + 1, message,
  } });
}

export function nextDocumentTimestamp(document: Document): Date {
  return new Date(Math.max(Date.now(), document.updatedAt.getTime() + 1));
}
