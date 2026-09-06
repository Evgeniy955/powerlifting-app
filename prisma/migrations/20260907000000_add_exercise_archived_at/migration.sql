-- Soft-delete for both exercise catalogs. Deleting an exercise that's still
-- referenced by training history (ExerciseEntry/Athlete1RM or
-- GymExerciseEntry/GymClientMax) now archives it instead of removing the
-- row: the FK stays intact, so existing plans/exports keep resolving the
-- name/category live via the relation, and only new selection is hidden.
-- An exercise with no usage at all is still hard-deleted by the API, so
-- these columns only ever get set on rows worth preserving.
ALTER TABLE "ExerciseCatalog" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "GymExerciseCatalog" ADD COLUMN "archivedAt" TIMESTAMP(3);
