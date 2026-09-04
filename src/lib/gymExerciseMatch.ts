import { findPossibleDuplicate, type DuplicateSuggestion } from './excelImport'
import type { ParsedGymPlan } from './gymImportParser'

export type GymExerciseMatch = {
  name: string
  // How many sets this name accounts for across the whole parsed plan —
  // shown next to the name on the review screen so the coach can gauge how
  // much of the import a given choice affects.
  count: number
  matchedExerciseId: string | null
  matchedExerciseName: string | null
  // Only set for a name that didn't match the catalog exactly — see
  // findPossibleDuplicate() in excelImport.ts (reused as-is; the
  // name/catalog matching problem is identical between the powerlifting
  // Excel import and this one, just fed a GymExerciseCatalog instead of an
  // ExerciseCatalog).
  possibleDuplicate: DuplicateSuggestion | null
}

export function gymExerciseNameKey(name: string): string {
  return name.trim().toLowerCase()
}

// For every unique exercise name in a parsed gym plan, checks it against the
// gym exercise catalog: an exact (case-insensitive) match is used as-is;
// otherwise a possible-duplicate suggestion is computed so the coach can
// reuse a near-identical existing exercise ("Присед" vs "Приседания")
// instead of the import silently creating a near-duplicate catalog row —
// same reasoning as the powerlifting Excel import.
export function matchGymExercises(
  parsed: ParsedGymPlan,
  catalog: { id: string; name: string }[]
): GymExerciseMatch[] {
  const byNormalizedName = new Map(catalog.map((e) => [gymExerciseNameKey(e.name), e]))

  const seen = new Map<string, { name: string; count: number }>()
  for (const workout of parsed.workouts) {
    for (const exercise of workout.exercises) {
      const key = gymExerciseNameKey(exercise.name)
      const existing = seen.get(key)
      if (existing) existing.count += 1
      else seen.set(key, { name: exercise.name, count: 1 })
    }
  }

  const matches: GymExerciseMatch[] = []
  for (const { name, count } of seen.values()) {
    const exact = byNormalizedName.get(gymExerciseNameKey(name))
    matches.push({
      name,
      count,
      matchedExerciseId: exact?.id ?? null,
      matchedExerciseName: exact?.name ?? null,
      possibleDuplicate: exact ? null : findPossibleDuplicate(name, catalog),
    })
  }
  return matches
}
