-- Foreign key columns without a covering index — flagged by Supabase's
-- performance advisor. Postgres doesn't auto-index FK columns (unlike
-- MySQL), so every join/filter through these relations (every workout, week,
-- and plan page; the athletes-list best-lifts query; auth session lookups)
-- was doing a sequential scan. IF NOT EXISTS makes this safe to re-run.
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "AthleteProfile_coachId_idx" ON "AthleteProfile"("coachId");
CREATE INDEX IF NOT EXISTS "Athlete1RM_exerciseId_idx" ON "Athlete1RM"("exerciseId");
CREATE INDEX IF NOT EXISTS "Workout_microcycleId_idx" ON "Workout"("microcycleId");
CREATE INDEX IF NOT EXISTS "ExerciseEntry_workoutId_idx" ON "ExerciseEntry"("workoutId");
CREATE INDEX IF NOT EXISTS "ExerciseEntry_exerciseId_idx" ON "ExerciseEntry"("exerciseId");
CREATE INDEX IF NOT EXISTS "SetEntry_exerciseEntryId_idx" ON "SetEntry"("exerciseEntryId");
