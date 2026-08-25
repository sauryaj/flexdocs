-- CreateTable
CREATE TABLE "WebsiteCheckLog" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteCheckLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteCheckLog_websiteId_checkedAt_idx" ON "WebsiteCheckLog"("websiteId", "checkedAt");

-- AddForeignKey
ALTER TABLE "WebsiteCheckLog" ADD CONSTRAINT "WebsiteCheckLog_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
