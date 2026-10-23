BEGIN;
-- AlterTable
ALTER TABLE "DocumentReview" ADD COLUMN     "attachmentManifest" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "DocumentReview" ADD CONSTRAINT "DocumentReview_frozen_metadata_arrays" CHECK (jsonb_typeof("tags") = 'array' AND jsonb_typeof("attachmentManifest") = 'array');
CREATE FUNCTION preserve_document_review_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."decision" <> 'pending' OR
    ROW(OLD."documentId", OLD."sourceRevisionId", OLD."submittedById", OLD."submittedAt", OLD."reviewerIds", OLD."tags", OLD."attachmentManifest") IS DISTINCT FROM
    ROW(NEW."documentId", NEW."sourceRevisionId", NEW."submittedById", NEW."submittedAt", NEW."reviewerIds", NEW."tags", NEW."attachmentManifest") THEN
    RAISE EXCEPTION 'Review submission and completed decisions are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "DocumentReview_frozen_submission" BEFORE UPDATE ON "DocumentReview"
FOR EACH ROW EXECUTE FUNCTION preserve_document_review_submission();
COMMIT;
