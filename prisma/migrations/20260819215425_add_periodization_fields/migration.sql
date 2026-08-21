-- AlterTable
ALTER TABLE "Cycle" ADD COLUMN "periodType" TEXT,
ADD COLUMN "stageType" TEXT,
ADD COLUMN "mesocycleType" TEXT;

-- AlterTable
ALTER TABLE "Microcycle" ADD COLUMN "microcycleType" TEXT;
