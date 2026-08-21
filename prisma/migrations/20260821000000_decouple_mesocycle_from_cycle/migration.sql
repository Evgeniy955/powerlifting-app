ALTER TABLE "Cycle" DROP CONSTRAINT IF EXISTS "Cycle_stageId_fkey";
DROP INDEX IF EXISTS "Cycle_stageId_idx";
ALTER TABLE "Cycle" DROP COLUMN IF EXISTS "stageId";
ALTER TABLE "Cycle" DROP COLUMN IF EXISTS "mesocycleType";
ALTER TABLE "Microcycle" DROP COLUMN IF EXISTS "microcycleType";

CREATE TABLE "Mesocycle" (
  "id" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "weeks" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mesocycle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Mesocycle_stageId_idx" ON "Mesocycle"("stageId");
ALTER TABLE "Mesocycle" ADD CONSTRAINT "Mesocycle_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PeriodizationMicrocycle" (
  "id" TEXT NOT NULL,
  "mesocycleId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "microcycleType" TEXT,
  CONSTRAINT "PeriodizationMicrocycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PeriodizationMicrocycle_mesocycleId_weekNumber_key" ON "PeriodizationMicrocycle"("mesocycleId", "weekNumber");
ALTER TABLE "PeriodizationMicrocycle" ADD CONSTRAINT "PeriodizationMicrocycle_mesocycleId_fkey" FOREIGN KEY ("mesocycleId") REFERENCES "Mesocycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
