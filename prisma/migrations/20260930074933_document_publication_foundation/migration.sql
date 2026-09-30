/*
  Warnings:

  - A unique constraint covering the columns `[publishedSnapshotId]` on the table `Document` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[documentId,id]` on the table `DocumentRevision` will be added. If there are existing duplicate values, this will fail.

*/
BEGIN;
-- CreateEnum
CREATE TYPE "DocumentLifecycle" AS ENUM ('draft', 'in_review', 'published', 'archived', 'trashed');

-- CreateEnum
CREATE TYPE "DocumentReviewDecision" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "lifecycleState" "DocumentLifecycle",
ADD COLUMN     "publishedSnapshotId" TEXT;

-- CreateTable
CREATE TABLE "DocumentPublication" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "attachmentManifest" JSONB NOT NULL DEFAULT '[]',
    "publisherId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReview" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reviewerIds" TEXT[],
    "decision" "DocumentReviewDecision" NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "feedback" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentPublication_documentId_publishedAt_idx" ON "DocumentPublication"("documentId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPublication_documentId_sourceRevisionId_key" ON "DocumentPublication"("documentId", "sourceRevisionId");

-- CreateIndex
CREATE INDEX "DocumentReview_documentId_decision_idx" ON "DocumentReview"("documentId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "Document_publishedSnapshotId_key" ON "Document"("publishedSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRevision_documentId_id_key" ON "DocumentRevision"("documentId", "id");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_publishedSnapshotId_fkey" FOREIGN KEY ("publishedSnapshotId") REFERENCES "DocumentPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPublication" ADD CONSTRAINT "DocumentPublication_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPublication" ADD CONSTRAINT "DocumentPublication_documentId_sourceRevisionId_fkey" FOREIGN KEY ("documentId", "sourceRevisionId") REFERENCES "DocumentRevision"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_documentId_sourceRevisionId_fkey" FOREIGN KEY ("documentId", "sourceRevisionId") REFERENCES "DocumentRevision"("documentId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentPublication" ADD CONSTRAINT "DocumentPublication_metadata_arrays" CHECK (jsonb_typeof("tags") = 'array' AND jsonb_typeof("attachmentManifest") = 'array');
ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_decision_metadata" CHECK (
  ("decision" = 'pending' AND "decidedAt" IS NULL AND "decidedById" IS NULL) OR
  ("decision" <> 'pending' AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL)
);
ALTER TABLE "Document" ADD CONSTRAINT "Document_lifecycle_flags" CHECK (
  "lifecycleState" IS NULL OR
  ("lifecycleState" = 'trashed' AND "deletedAt" IS NOT NULL) OR
  ("deletedAt" IS NULL AND (("lifecycleState" = 'archived' AND "isArchived") OR
    ("lifecycleState" IN ('draft', 'in_review', 'published') AND NOT "isArchived")))
);

CREATE FUNCTION reject_document_publication_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "DocumentPublication_immutable" BEFORE UPDATE ON "DocumentPublication"
FOR EACH ROW EXECUTE FUNCTION reject_document_publication_update();

CREATE FUNCTION validate_document_publication_pointer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."publishedSnapshotId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "DocumentPublication" WHERE "id" = NEW."publishedSnapshotId" AND "documentId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Published snapshot must belong to its document' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Document_publication_pointer" BEFORE INSERT OR UPDATE OF "publishedSnapshotId", "id" ON "Document"
FOR EACH ROW EXECUTE FUNCTION validate_document_publication_pointer();
COMMIT;
