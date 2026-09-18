-- AlterTable
ALTER TABLE "Password" ADD COLUMN     "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rotationMethod" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "rotationPort" INTEGER NOT NULL DEFAULT 22,
ADD COLUMN     "rotationTarget" TEXT,
ADD COLUMN     "rotationUsername" TEXT;

-- CreateTable
CREATE TABLE "ServiceRequestTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fields" TEXT NOT NULL DEFAULT '[]',
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequestTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequestTemplate_organizationId_idx" ON "ServiceRequestTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceRequestTemplate_active_idx" ON "ServiceRequestTemplate"("active");

-- AddForeignKey
ALTER TABLE "ServiceRequestTemplate" ADD CONSTRAINT "ServiceRequestTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestTemplate" ADD CONSTRAINT "ServiceRequestTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
