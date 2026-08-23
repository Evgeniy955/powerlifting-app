// Groups consecutive sets that share the same weight and reps into a single
// "count × reps" line — e.g. four straight 135kg×3 sets collapse into one
// "4×3" row instead of four identical ones. Deliberately not a global
// group-by (weight+reps regardless of position): a program can legitimately
// revisit the same weight/reps later in the day as a separate block, and
// merging those together would misrepresent the set order. Used by
// ExerciseCard's "Компактный режим".
export type SetGroup = {
  weight: number
  reps: number
  count: number
  percentOf1rm: number | null
}

export function groupSets(
  sets: { weight: number; reps: number }[],
  oneRepMax: number | null
): SetGroup[] {
  const groups: SetGroup[] = []
  for (const s of sets) {
    const last = groups[groups.length - 1]
    if (last && last.weight === s.weight && last.reps === s.reps) {
      last.count += 1
    } else {
      groups.push({
        weight: s.weight,
        reps: s.reps,
        count: 1,
        percentOf1rm: oneRepMax ? s.weight / oneRepMax : null,
      })
    }
  }
  return groups
}
