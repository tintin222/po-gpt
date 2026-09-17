-- AlterTable
ALTER TABLE "LlmModel" ADD COLUMN     "toolsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "GeneratedFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratedFile_userId_createdAt_idx" ON "GeneratedFile"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedFile" ADD CONSTRAINT "GeneratedFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

