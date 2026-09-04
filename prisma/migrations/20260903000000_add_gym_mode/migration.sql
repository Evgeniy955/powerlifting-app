CREATE TABLE "AthleteHealthProfile" (
  "id" TEXT NOT NULL, "athleteId" TEXT NOT NULL, "injuries" TEXT, "contraindications" TEXT, "notes" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AthleteHealthProfile_pkey" PRIMARY KEY ("id"), CONSTRAINT "AthleteHealthProfile_athleteId_key" UNIQUE ("athleteId"),
  CONSTRAINT "AthleteHealthProfile_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "AthleteAssessment" (
  "id" TEXT NOT NULL, "athleteId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "storagePath" TEXT NOT NULL, "extractedText" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AthleteAssessment_pkey" PRIMARY KEY ("id"), CONSTRAINT "AthleteAssessment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AthleteAssessment_athleteId_createdAt_idx" ON "AthleteAssessment"("athleteId", "createdAt");
CREATE TABLE "GymExerciseCatalog" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT, "description" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GymExerciseCatalog_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymExerciseCatalog_name_key" UNIQUE ("name"));
CREATE TABLE "GymAthleteMax" ("id" TEXT NOT NULL, "athleteId" TEXT NOT NULL, "exerciseId" TEXT NOT NULL, "value" DOUBLE PRECISION NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "GymAthleteMax_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymAthleteMax_athleteId_exerciseId_key" UNIQUE ("athleteId", "exerciseId"), CONSTRAINT "GymAthleteMax_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "GymAthleteMax_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "GymExerciseCatalog"("id") ON UPDATE CASCADE);
CREATE INDEX "GymAthleteMax_exerciseId_idx" ON "GymAthleteMax"("exerciseId");
CREATE TABLE "GymPlan" ("id" TEXT NOT NULL, "athleteId" TEXT NOT NULL, "name" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "weeks" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GymPlan_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymPlan_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "GymPlan_athleteId_startDate_idx" ON "GymPlan"("athleteId", "startDate");
CREATE TABLE "GymWeek" ("id" TEXT NOT NULL, "planId" TEXT NOT NULL, "weekNumber" INTEGER NOT NULL, CONSTRAINT "GymWeek_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymWeek_planId_weekNumber_key" UNIQUE ("planId", "weekNumber"), CONSTRAINT "GymWeek_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GymPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "GymWorkout" ("id" TEXT NOT NULL, "weekId" TEXT NOT NULL, "scheduledDate" TIMESTAMP(3) NOT NULL, "dayNumber" INTEGER NOT NULL, CONSTRAINT "GymWorkout_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymWorkout_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "GymWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "GymWorkout_weekId_idx" ON "GymWorkout"("weekId");
CREATE TABLE "GymExerciseEntry" ("id" TEXT NOT NULL, "workoutId" TEXT NOT NULL, "exerciseId" TEXT NOT NULL, "orderIndex" INTEGER NOT NULL DEFAULT 0, "oneRepMax" DOUBLE PRECISION, CONSTRAINT "GymExerciseEntry_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymExerciseEntry_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "GymWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "GymExerciseEntry_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "GymExerciseCatalog"("id") ON UPDATE CASCADE);
CREATE INDEX "GymExerciseEntry_workoutId_idx" ON "GymExerciseEntry"("workoutId");
CREATE TABLE "GymSetEntry" ("id" TEXT NOT NULL, "entryId" TEXT NOT NULL, "setNumber" INTEGER NOT NULL, "weight" DOUBLE PRECISION NOT NULL, "reps" INTEGER NOT NULL, "completed" BOOLEAN NOT NULL DEFAULT false, CONSTRAINT "GymSetEntry_pkey" PRIMARY KEY ("id"), CONSTRAINT "GymSetEntry_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "GymExerciseEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE INDEX "GymSetEntry_entryId_idx" ON "GymSetEntry"("entryId");
