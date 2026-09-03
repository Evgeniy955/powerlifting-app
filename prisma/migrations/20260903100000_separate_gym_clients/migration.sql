-- Gym clients are a separate business domain from powerlifting athletes.
-- Preserve any records created by the initial gym migration by creating a
-- GymClient with the same id before moving its foreign keys.
CREATE TABLE "GymClient" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "coachId" TEXT,
  "displayName" TEXT,
  "inviteEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GymClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GymClient_userId_key" ON "GymClient"("userId");
CREATE INDEX "GymClient_coachId_idx" ON "GymClient"("coachId");

ALTER TABLE "GymClient"
  ADD CONSTRAINT "GymClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GymClient_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "GymClient" ("id", "userId", "coachId", "displayName", "inviteEmail", "createdAt")
SELECT "id", "userId", "coachId", "displayName", "inviteEmail", "createdAt"
FROM "AthleteProfile"
WHERE "id" IN (
  SELECT "athleteId" FROM "AthleteHealthProfile"
  UNION SELECT "athleteId" FROM "AthleteAssessment"
  UNION SELECT "athleteId" FROM "GymAthleteMax"
  UNION SELECT "athleteId" FROM "GymPlan"
)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "AthleteHealthProfile" RENAME TO "GymClientHealthProfile";
ALTER TABLE "GymClientHealthProfile" RENAME COLUMN "athleteId" TO "clientId";
ALTER TABLE "GymClientHealthProfile" DROP CONSTRAINT "AthleteHealthProfile_athleteId_fkey";
ALTER TABLE "GymClientHealthProfile" RENAME CONSTRAINT "AthleteHealthProfile_pkey" TO "GymClientHealthProfile_pkey";
ALTER TABLE "GymClientHealthProfile" RENAME CONSTRAINT "AthleteHealthProfile_athleteId_key" TO "GymClientHealthProfile_clientId_key";
ALTER TABLE "GymClientHealthProfile" ADD CONSTRAINT "GymClientHealthProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "GymClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AthleteAssessment" RENAME TO "GymClientAssessment";
ALTER TABLE "GymClientAssessment" RENAME COLUMN "athleteId" TO "clientId";
ALTER TABLE "GymClientAssessment" DROP CONSTRAINT "AthleteAssessment_athleteId_fkey";
ALTER TABLE "GymClientAssessment" RENAME CONSTRAINT "AthleteAssessment_pkey" TO "GymClientAssessment_pkey";
ALTER INDEX "AthleteAssessment_athleteId_createdAt_idx" RENAME TO "GymClientAssessment_clientId_createdAt_idx";
ALTER TABLE "GymClientAssessment" ADD CONSTRAINT "GymClientAssessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "GymClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GymAthleteMax" RENAME TO "GymClientMax";
ALTER TABLE "GymClientMax" RENAME COLUMN "athleteId" TO "clientId";
ALTER TABLE "GymClientMax" DROP CONSTRAINT "GymAthleteMax_athleteId_fkey";
ALTER TABLE "GymClientMax" RENAME CONSTRAINT "GymAthleteMax_pkey" TO "GymClientMax_pkey";
ALTER TABLE "GymClientMax" RENAME CONSTRAINT "GymAthleteMax_athleteId_exerciseId_key" TO "GymClientMax_clientId_exerciseId_key";
ALTER INDEX "GymAthleteMax_exerciseId_idx" RENAME TO "GymClientMax_exerciseId_idx";
ALTER TABLE "GymClientMax" ADD CONSTRAINT "GymClientMax_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "GymClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GymPlan" RENAME COLUMN "athleteId" TO "clientId";
ALTER TABLE "GymPlan" DROP CONSTRAINT "GymPlan_athleteId_fkey";
ALTER INDEX "GymPlan_athleteId_startDate_idx" RENAME TO "GymPlan_clientId_startDate_idx";
ALTER TABLE "GymPlan" ADD CONSTRAINT "GymPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "GymClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
