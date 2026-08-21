// Season-periodization presets & colors — labels a coach tags onto a Cycle
// (one mesocycle — "Мезоциклы" row) or a Microcycle (one week —
// "Микроциклы" row) from the periodization timeline page
// (/athletes/[athleteId]/periodization), reproducing the classic
// Период → Этап → Мезоцикл → Микроцикл planning sheet.
//
// All four lists back a closed <select> dropdown in PeriodizationView (the
// standard, fixed set of periodization terms) rather than an enum in the
// schema — same reasoning as ExerciseCatalog.trainingGroup in
// lib/trainingGroups.ts: still plain strings at the DB/API level (SQLite,
// used for local dev, doesn't support Prisma enums), the UI is just the one
// place that constrains them to this list.

export const PERIOD_PRESETS = ['Подготовительный', 'Соревновательный', 'Переходной'] as const

export const STAGE_PRESETS = [
  'Обще-подготовительный',
  'Специально-подготовительный',
  'Соревновательный',
  'Восстановительный',
] as const

export const MESOCYCLE_PRESETS = [
  'Втягивающий',
  'Базовый',
  'Контрольно-подготовительный',
  'Предсоревновательный',
  'Соревновательный',
  'Восстановительный',
] as const

export const MICROCYCLE_PRESETS = [
  'Втягивающий',
  'Ударный',
  'Подводящий',
  'Предсоревновательный',
  'Соревновательный',
  'Восстановительный',
] as const

export type PeriodColor = { bg: string; text: string }

// Период row's fill, reused as-is for the Этап row underneath it — an этап
// always sits inside exactly one период (its own label differs, e.g.
// "Обще-подготовительный" inside a green "Подготовительный" период), so it
// reads as a sub-division of that период's color rather than needing an
// independent 4th palette. Only the three standard периоды below get a
// semantic color; a custom-typed период name still renders (just with the
// neutral "unset" fill), same as an unrecognized training block elsewhere.
const PERIOD_COLOR: Record<string, PeriodColor> = {
  Подготовительный: { bg: 'bg-emerald-400', text: 'text-emerald-950' },
  Соревновательный: { bg: 'bg-yellow-300', text: 'text-yellow-950' },
  Переходной: { bg: 'bg-sky-500', text: 'text-white' },
}

export const UNASSIGNED_PERIOD_COLOR: PeriodColor = {
  bg: 'bg-surface-2',
  text: 'text-text-secondary',
}

export function periodColor(period: string | null | undefined): PeriodColor {
  if (!period) return UNASSIGNED_PERIOD_COLOR
  return PERIOD_COLOR[period] ?? UNASSIGNED_PERIOD_COLOR
}

// Этап row uses the same lookup as its parent период — the caller passes
// whichever период the этап's cycle is tagged with, not the этап name
// itself (this row deliberately doesn't get its own independent palette).
export const stageColor = periodColor
