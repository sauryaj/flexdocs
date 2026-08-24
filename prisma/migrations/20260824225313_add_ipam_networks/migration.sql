-- CreateTable
CREATE TABLE "IpamNetwork" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "vlanId" INTEGER,
    "notes" TEXT,
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpamNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpamNetwork_userId_idx" ON "IpamNetwork"("userId");

-- CreateIndex
CREATE INDEX "IpamNetwork_organizationId_idx" ON "IpamNetwork"("organizationId");

-- AddForeignKey
ALTER TABLE "IpamNetwork" ADD CONSTRAINT "IpamNetwork_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpamNetwork" ADD CONSTRAINT "IpamNetwork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
