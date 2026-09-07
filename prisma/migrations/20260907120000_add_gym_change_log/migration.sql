CREATE TABLE "GymChangeLog" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "planId" TEXT,
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
  CONSTRAINT "GymChangeLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GymChangeLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "GymClient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GymChangeLog_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GymPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GymChangeLog_clientId_createdAt_idx" ON "GymChangeLog"("clientId", "createdAt");
CREATE INDEX "GymChangeLog_planId_createdAt_idx" ON "GymChangeLog"("planId", "createdAt");
CREATE INDEX "GymChangeLog_workoutId_idx" ON "GymChangeLog"("workoutId");
CREATE INDEX "GymChangeLog_exerciseEntryId_setEntryId_idx" ON "GymChangeLog"("exerciseEntryId", "setEntryId");

-- Matches every other gym table's RLS posture (enabled, no explicit policy
-- — deny-by-default for the anon/authenticated REST API; the app itself
-- connects via Prisma as the postgres role, which has BYPASSRLS, so this
-- doesn't affect the app — see supabase_rls_setup.sql's header comment).
ALTER TABLE "GymChangeLog" ENABLE ROW LEVEL SECURITY;
