-- CreateEnum
CREATE TYPE "DocumentOwnershipRequestStatus" AS ENUM ('pending', 'cancelled', 'completed');

-- CreateTable
CREATE TABLE "DocumentOwnershipRequest" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "documentId" TEXT,
    "sourceOwnershipKind" "DocumentOwnership" NOT NULL,
    "sourceOrganizationId" TEXT,
    "sourceOwnerId" TEXT NOT NULL,
    "destinationOrganizationId" TEXT NOT NULL,
    "expectedUpdatedAt" TIMESTAMP(3) NOT NULL,
    "previewFingerprint" TEXT NOT NULL,
    "status" "DocumentOwnershipRequestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "consentedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "resultUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentOwnershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentOwnershipRequest_documentId_status_idx" ON "DocumentOwnershipRequest"("documentId", "status");

-- CreateIndex
CREATE INDEX "DocumentOwnershipRequest_actorId_createdAt_idx" ON "DocumentOwnershipRequest"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentOwnershipRequest_status_expiresAt_idx" ON "DocumentOwnershipRequest"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentOwnershipRequest_actorId_key_key" ON "DocumentOwnershipRequest"("actorId", "key");

-- AddForeignKey
ALTER TABLE "DocumentOwnershipRequest" ADD CONSTRAINT "DocumentOwnershipRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOwnershipRequest" ADD CONSTRAINT "DocumentOwnershipRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOwnershipRequest" ADD CONSTRAINT "DocumentOwnershipRequest_destinationOrganizationId_fkey" FOREIGN KEY ("destinationOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
