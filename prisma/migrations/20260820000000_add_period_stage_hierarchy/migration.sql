CREATE TABLE "Period" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Period_athleteId_idx" ON "Period"("athleteId");
ALTER TABLE "Period" ADD CONSTRAINT "Period_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Stage" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Stage_periodId_idx" ON "Stage"("periodId");
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Cycle" DROP COLUMN "periodType";
ALTER TABLE "Cycle" DROP COLUMN "stageType";
ALTER TABLE "Cycle" ADD COLUMN "stageId" TEXT;
CREATE INDEX "Cycle_stageId_idx" ON "Cycle"("stageId");
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
