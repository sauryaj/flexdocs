import { Prisma, type Document } from '@prisma/client';
import { type z } from 'zod';
import { prisma } from '@/lib/prisma';
import { resolveDocumentCapabilities } from '@/lib/document-capability-service';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { DocumentWriteError, nextDocumentTimestamp, snapshotDocument, revisionSchema } from '@/lib/document-write';

export async function readDocumentHistory(actorId: string, documentId: string) {
  return prisma.$transaction(async tx => {
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!document || !actor || !(await resolveDocumentCapabilities(document, actor, tx)).readWorking) throw new DocumentWriteError(404, 'Not found');
    return tx.documentRevision.findMany({ where: { documentId }, orderBy: { version: 'desc' } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function withHistoryWrite<T>(actorId: string, documentId: string, expectedUpdatedAt: string | undefined,
  action: 'edit' | 'restoreHistory', write: (tx: Prisma.TransactionClient, document: Document) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
    const document = await tx.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new DocumentWriteError(404, 'Not found');
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
    if (!actor) throw new DocumentWriteError(404, 'Not found');
    const capabilities = await resolveDocumentCapabilities(document, actor, tx);
    if (!capabilities[action] || !capabilities.edit || (document.lifecycleState !== null && document.isArchived)) throw new DocumentWriteError(404, 'Not found');
    if (document.ownershipKind === 'organization' && document.lifecycleState === null) throw new DocumentWriteError(409, 'Team document must use the review lifecycle');
    if ((document.lifecycleState !== null || document.ownershipKind === 'organization') && !expectedUpdatedAt) throw new DocumentWriteError(428, 'Reload and provide the current document version');
    if (expectedUpdatedAt && document.updatedAt.toISOString() !== expectedUpdatedAt) throw new DocumentWriteError(409, 'This document changed since you loaded it. Reload and compare before trying again.');
    return write(tx, document);
  });
}

async function withdrawSupersededReviews(tx: Prisma.TransactionClient, actorId: string, documentId: string) {
  const pending = await tx.documentReview.findMany({ where: { documentId, decision: 'pending' }, select: { id: true } });
  for (const review of pending) {
    await tx.documentReview.update({ where: { id: review.id }, data: { decision: 'withdrawn', decidedById: actorId, decidedAt: new Date(), feedback: 'Working version replaced through document history' } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.review.withdrawn', resourceType: 'document', resourceId: documentId, details: JSON.stringify({ reviewId: review.id, reason: 'history_version_replaced' }) } });
  }
}

async function saveHistoryVersion(tx: Prisma.TransactionClient, actorId: string, document: Document,
  fields: { title?: string; content?: string; category?: string }, message: string | null, sourceRevisionId?: string) {
  await snapshotDocument(tx, document, sourceRevisionId ? 'Saved before restore' : 'Saved before revision', actorId);
  if (document.lifecycleState !== null) await withdrawSupersededReviews(tx, actorId, document.id);
  const updated = await tx.document.update({ where: { id: document.id }, data: {
    ...fields, updatedAt: nextDocumentTimestamp(document), ...(document.lifecycleState !== null ? { lifecycleState: 'draft' } : {}),
  } });
  const latest = await tx.documentRevision.findFirst({ where: { documentId: document.id }, orderBy: { version: 'desc' } });
  const revision = await tx.documentRevision.create({ data: { documentId: document.id, userId: actorId,
    title: updated.title, content: updated.content, category: updated.category, version: (latest?.version ?? 0) + 1, message } });
  await tx.activityLog.create({ data: { userId: actorId, action: sourceRevisionId ? 'document.history.restore' : 'document.revision.create',
    resourceType: 'document', resourceId: document.id, details: JSON.stringify({ revisionId: revision.id, version: revision.version, ...(sourceRevisionId ? { sourceRevisionId } : {}) }) } });
  return { ...revision, updatedAt: updated.updatedAt };
}

export async function createDocumentRevision(actorId: string, documentId: string, input: z.infer<typeof revisionSchema>) {
  const { expectedUpdatedAt, message, ...fields } = revisionSchema.parse(input);
  return withHistoryWrite(actorId, documentId, expectedUpdatedAt, 'edit', (tx, document) => saveHistoryVersion(tx, actorId, document, fields, message || null));
}

export async function restoreDocumentRevision(actorId: string, documentId: string, revisionId: string, expectedUpdatedAt?: string) {
  return withHistoryWrite(actorId, documentId, expectedUpdatedAt, 'restoreHistory', async (tx, document) => {
    const revision = await tx.documentRevision.findFirst({ where: { id: revisionId, documentId } });
    if (!revision) throw new DocumentWriteError(404, 'Revision not found');
    return saveHistoryVersion(tx, actorId, document, { title: revision.title, content: revision.content, category: revision.category }, `Restored from revision v${revision.version}`, revision.id);
  });
}
