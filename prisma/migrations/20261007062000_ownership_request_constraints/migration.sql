ALTER TABLE "DocumentOwnershipRequest" ADD CONSTRAINT "ownership_request_valid_payload" CHECK (
  "key" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  AND "payloadHash" ~ '^[a-f0-9]{64}$'
  AND "previewFingerprint" ~ '^[a-f0-9]{64}$'
  AND ("documentId" IS NULL OR "documentId" = "sourceDocumentId")
  AND "expiresAt" > "createdAt"
);

ALTER TABLE "DocumentOwnershipRequest" ADD CONSTRAINT "ownership_request_valid_state" CHECK (
  ("status" = 'pending' AND "cancelledAt" IS NULL AND "consentedAt" IS NULL AND "completedAt" IS NULL AND "resultUpdatedAt" IS NULL)
  OR ("status" = 'cancelled' AND "cancelledAt" IS NOT NULL AND "consentedAt" IS NULL AND "completedAt" IS NULL AND "resultUpdatedAt" IS NULL)
  OR ("status" = 'completed' AND "cancelledAt" IS NULL AND "consentedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "resultUpdatedAt" IS NOT NULL)
);

CREATE FUNCTION ownership_request_immutable_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."actorId", NEW."key", NEW."payloadHash", NEW."sourceDocumentId", NEW."sourceOwnershipKind",
    NEW."sourceOrganizationId", NEW."sourceOwnerId", NEW."destinationOrganizationId", NEW."expectedUpdatedAt",
    NEW."previewFingerprint", NEW."createdAt", NEW."expiresAt")
    IS DISTINCT FROM ROW(OLD."actorId", OLD."key", OLD."payloadHash", OLD."sourceDocumentId", OLD."sourceOwnershipKind",
    OLD."sourceOrganizationId", OLD."sourceOwnerId", OLD."destinationOrganizationId", OLD."expectedUpdatedAt",
    OLD."previewFingerprint", OLD."createdAt", OLD."expiresAt")
    OR (NEW."documentId" IS DISTINCT FROM OLD."documentId" AND NEW."documentId" IS NOT NULL)
    OR (OLD."status" <> 'pending' AND ROW(NEW."status", NEW."cancelledAt", NEW."consentedAt", NEW."completedAt", NEW."resultUpdatedAt")
      IS DISTINCT FROM ROW(OLD."status", OLD."cancelledAt", OLD."consentedAt", OLD."completedAt", OLD."resultUpdatedAt"))
  THEN
    RAISE EXCEPTION 'Ownership request payload and terminal outcomes are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DocumentOwnershipRequest_immutable" BEFORE UPDATE ON "DocumentOwnershipRequest"
FOR EACH ROW EXECUTE FUNCTION ownership_request_immutable_payload();
