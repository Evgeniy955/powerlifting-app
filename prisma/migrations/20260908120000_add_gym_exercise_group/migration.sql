ALTER TABLE "GymExerciseEntry" ADD COLUMN "groupId" TEXT;
ALTER TABLE "GymExerciseEntry" ADD COLUMN "groupType" TEXT;

CREATE INDEX "GymExerciseEntry_groupId_idx" ON "GymExerciseEntry"("groupId");
