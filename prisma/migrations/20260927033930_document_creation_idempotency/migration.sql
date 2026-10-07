-- CreateTable
CREATE TABLE "DocumentCreationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentCreationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCreationRequest_documentId_key" ON "DocumentCreationRequest"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCreationRequest_userId_key_key" ON "DocumentCreationRequest"("userId", "key");

-- AddForeignKey
ALTER TABLE "DocumentCreationRequest" ADD CONSTRAINT "DocumentCreationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCreationRequest" ADD CONSTRAINT "DocumentCreationRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
