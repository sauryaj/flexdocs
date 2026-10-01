BEGIN;

-- CreateEnum
CREATE TYPE "DocumentOwnership" AS ENUM ('personal', 'organization');

-- CreateEnum
CREATE TYPE "DocumentationRole" AS ENUM ('reader', 'contributor', 'reviewer', 'administrator');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "ownershipKind" "DocumentOwnership" NOT NULL DEFAULT 'personal',
ADD COLUMN     "responsibleUserId" TEXT;

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "ownershipKind" "DocumentOwnership" NOT NULL DEFAULT 'personal';

-- CreateTable
CREATE TABLE "OrganizationDocumentationGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DocumentationRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationDocumentationGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationDocumentationGrant_userId_idx" ON "OrganizationDocumentationGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDocumentationGrant_organizationId_userId_key" ON "OrganizationDocumentationGrant"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Document_responsibleUserId_idx" ON "Document"("responsibleUserId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDocumentationGrant" ADD CONSTRAINT "OrganizationDocumentationGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDocumentationGrant" ADD CONSTRAINT "OrganizationDocumentationGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_organization_owner_requires_org"
CHECK ("ownershipKind" <> 'organization' OR "organizationId" IS NOT NULL);

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_organization_owner_requires_org"
CHECK ("ownershipKind" <> 'organization' OR "organizationId" IS NOT NULL);

COMMIT;
