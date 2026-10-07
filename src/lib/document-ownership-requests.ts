import { createHash } from 'node:crypto';
import { type DocumentOwnershipRequest, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { hasPermission } from '@/lib/rbac';
import { lockDocumentationAdministration } from '@/lib/documentation-grants';
import { previewDocumentOwnershipInTransaction } from '@/lib/document-ownership-preview';
import { DocumentWriteError } from '@/lib/document-write';

export const ownershipRequestSchema = z.object({
  key: z.string().uuid().transform(value => value.toLowerCase()),
  destinationOrganizationId: z.string().min(1).max(200),
  expectedUpdatedAt: z.string().datetime().transform(value => new Date(value).toISOString()),
  previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

function requestResult(request: DocumentOwnershipRequest) {
  return { id: request.id, documentId: request.sourceDocumentId, destinationOrganizationId: request.destinationOrganizationId,
    status: request.status, expectedUpdatedAt: request.expectedUpdatedAt.toISOString(), previewFingerprint: request.previewFingerprint,
    createdAt: request.createdAt.toISOString(), expiresAt: request.expiresAt.toISOString(),
    expired: request.status === 'pending' && request.expiresAt.getTime() <= Date.now(),
    cancelledAt: request.cancelledAt?.toISOString() ?? null, consentedAt: request.consentedAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null, resultUpdatedAt: request.resultUpdatedAt?.toISOString() ?? null,
    documentAvailable: request.documentId !== null, executionAvailable: false };
}

async function requestActor(tx: Prisma.TransactionClient, actorId: string, write = false) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } });
  if (!actor || !hasPermission(actor.role, write ? 'document.update' : 'document.read')) throw new DocumentWriteError(403, 'Forbidden');
  return actor;
}

export async function prepareDocumentOwnershipRequest(actorId: string, documentId: string, input: unknown) {
  const parsed = ownershipRequestSchema.safeParse(input);
  if (!parsed.success) throw new DocumentWriteError(400, 'Invalid ownership request');
  const fields = parsed.data;
  const payloadHash = createHash('sha256').update(JSON.stringify({ documentId, destinationOrganizationId: fields.destinationOrganizationId,
    expectedUpdatedAt: fields.expectedUpdatedAt, previewFingerprint: fields.previewFingerprint })).digest('hex');
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    await requestActor(tx, actorId, true);
    const previous = await tx.documentOwnershipRequest.findUnique({ where: { actorId_key: { actorId, key: fields.key } } });
    if (previous) {
      if (previous.payloadHash !== payloadHash) throw new DocumentWriteError(409, 'Request key already used for a different ownership preview');
      return { request: requestResult(previous), replayed: true };
    }
    await tx.$queryRaw`SELECT "id" FROM "Document" WHERE "id" = ${documentId} FOR UPDATE`;
    const preview = await previewDocumentOwnershipInTransaction(tx, actorId, documentId, fields.destinationOrganizationId, fields.expectedUpdatedAt);
    if (preview.fingerprint !== fields.previewFingerprint) throw new DocumentWriteError(409, 'Ownership audience or document state changed. Review a new preview.');
    if (preview.blockers.length) throw new DocumentWriteError(409, 'Resolve the ownership preview blockers before requesting conversion');
    const document = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
    const request = await tx.documentOwnershipRequest.create({ data: {
      actorId, key: fields.key, payloadHash, documentId, sourceDocumentId: documentId, sourceOwnershipKind: document.ownershipKind,
      sourceOrganizationId: document.organizationId, sourceOwnerId: document.userId, destinationOrganizationId: fields.destinationOrganizationId,
      expectedUpdatedAt: new Date(fields.expectedUpdatedAt), previewFingerprint: fields.previewFingerprint,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.ownership.request', resourceType: 'document', resourceId: documentId,
      details: JSON.stringify({ requestId: request.id, sourceOwnershipKind: request.sourceOwnershipKind,
        sourceOrganizationId: request.sourceOrganizationId, destinationOrganizationId: request.destinationOrganizationId, expiresAt: request.expiresAt.toISOString() }) } });
    return { request: requestResult(request), replayed: false };
  });
}

export async function readDocumentOwnershipRequest(actorId: string, requestId: string) {
  return prisma.$transaction(async tx => {
    await requestActor(tx, actorId);
    const request = await tx.documentOwnershipRequest.findFirst({ where: { id: requestId, actorId } });
    if (!request) throw new DocumentWriteError(404, 'Not found');
    return requestResult(request);
  });
}

export async function cancelDocumentOwnershipRequest(actorId: string, requestId: string) {
  return prisma.$transaction(async tx => {
    await lockDocumentationAdministration(tx);
    await requestActor(tx, actorId);
    await tx.$queryRaw`SELECT "id" FROM "DocumentOwnershipRequest" WHERE "id" = ${requestId} AND "actorId" = ${actorId} FOR UPDATE`;
    const request = await tx.documentOwnershipRequest.findFirst({ where: { id: requestId, actorId } });
    if (!request) throw new DocumentWriteError(404, 'Not found');
    if (request.status === 'completed') throw new DocumentWriteError(409, 'Completed ownership changes cannot be cancelled');
    if (request.status === 'cancelled') return requestResult(request);
    const cancelled = await tx.documentOwnershipRequest.update({ where: { id: requestId }, data: { status: 'cancelled', cancelledAt: new Date() } });
    await tx.activityLog.create({ data: { userId: actorId, action: 'document.ownership.cancel', resourceType: 'document', resourceId: request.sourceDocumentId,
      details: JSON.stringify({ requestId }) } });
    return requestResult(cancelled);
  });
}
