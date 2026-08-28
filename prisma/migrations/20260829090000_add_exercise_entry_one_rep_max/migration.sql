-- Keep the 1RM that was used to program each exercise entry. Existing plans
-- did not retain historical 1RM values, so their entries are initialised with
-- the athlete's currently stored value as a one-time migration baseline.
ALTER TABLE "ExerciseEntry" ADD COLUMN "oneRepMax" DOUBLE PRECISION;

UPDATE "ExerciseEntry" AS entry
SET "oneRepMax" = rm."value"
FROM "Workout" AS workout
JOIN "Microcycle" AS microcycle ON microcycle."id" = workout."microcycleId"
JOIN "Cycle" AS cycle ON cycle."id" = microcycle."cycleId"
JOIN "Athlete1RM" AS rm
  ON rm."athleteId" = cycle."athleteId"
WHERE entry."workoutId" = workout."id"
  AND rm."exerciseId" = entry."exerciseId";
