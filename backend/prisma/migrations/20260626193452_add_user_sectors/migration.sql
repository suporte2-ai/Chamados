-- CreateTable
CREATE TABLE "user_sectors" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sectorId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_sectors_sectorId_idx" ON "user_sectors"("sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sectors_userId_sectorId_key" ON "user_sectors"("userId", "sectorId");

-- AddForeignKey
ALTER TABLE "user_sectors" ADD CONSTRAINT "user_sectors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sectors" ADD CONSTRAINT "user_sectors_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
