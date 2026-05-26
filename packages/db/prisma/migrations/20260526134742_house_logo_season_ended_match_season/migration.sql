-- AlterTable
ALTER TABLE "House" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "seasonId" TEXT;

-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "isEnded" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;
