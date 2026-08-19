// Training-block classification for ExerciseCatalog.trainingGroup — a coach
// manually "moves" an exercise into one of these from the admin exercise
// page. Independent of `category` (movement pattern) and of lib/mainLifts.ts
// (competition-lift specificity, used for mesocycle analytics) — this axis
// is about periodization role instead: Базовые (competition/near-competition
// lifts), СФП (specialized prep — technical assistance close to the
// competition pattern), ОФП (general prep — everything else, conditioning
// and isolation work).

export type TrainingGroup = 'BASE' | 'SPP' | 'GPP'

export const TRAINING_GROUPS: TrainingGroup[] = ['BASE', 'SPP', 'GPP']

export const TRAINING_GROUP_LABEL: Record<TrainingGroup, string> = {
  BASE: 'Базовые',
  SPP: 'СФП',
  GPP: 'ОФП',
}

export function isTrainingGroup(value: unknown): value is TrainingGroup {
  return typeof value === 'string' && (TRAINING_GROUPS as string[]).includes(value)
}
