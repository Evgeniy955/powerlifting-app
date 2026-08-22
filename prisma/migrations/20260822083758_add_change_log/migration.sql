-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "workoutId" TEXT,
    "workoutDate" TIMESTAMP(3),
    "weekNumber" INTEGER,
    "dayNumber" INTEGER,
    "exerciseEntryId" TEXT,
    "exerciseName" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "setEntryId" TEXT,
    "setNumber" INTEGER,
    "field" TEXT,
    "beforeValue" DOUBLE PRECISION,
    "afterValue" DOUBLE PRECISION,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "seenByCoach" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeLog_athleteId_createdAt_idx" ON "ChangeLog"("athleteId", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeLog_workoutId_idx" ON "ChangeLog"("workoutId");

-- CreateIndex
CREATE INDEX "ChangeLog_exerciseEntryId_setEntryId_idx" ON "ChangeLog"("exerciseEntryId", "setEntryId");

-- AddForeignKey
ALTER TABLE "ChangeLog" ADD CONSTRAINT "ChangeLog_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
