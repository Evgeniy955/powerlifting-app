-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weightClass" TEXT,
    "bodyweight" DOUBLE PRECISION,
    "squat" DOUBLE PRECISION,
    "bench" DOUBLE PRECISION,
    "deadlift" DOUBLE PRECISION,
    "place" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competition_athleteId_idx" ON "Competition"("athleteId");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
