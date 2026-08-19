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

// Shared color palette for the three blocks — one hue each, used everywhere a
// block needs to be visually identifiable at a glance: the admin exercise
// list (section headings + a colored left border per card) and the workout
// day table (a small dot next to each exercise name). Deliberately a
// separate palette from the zone-{low,moderate,high,max} intensity colors
// used for %1RM/RPE elsewhere — mixing the two would make a card/row look
// like it's flagging an intensity zone when it's actually just naming a
// training block. Literal Tailwind palette utilities (not the app's
// CSS-variable token system) so they render identically across all 3 themes.
export type TrainingGroupColor = {
  dot: string // small solid indicator (e.g. a row marker)
  text: string // heading / label text color
  border: string // heading underline (only one side has width, safe to
  // apply a same-color border on all sides)
  borderLeft: string // left-accent stripe on a card that already has its own
  // border on every side — a plain `border` color here would recolor all 4
  // sides, not just the accent stripe
  badgeBg: string // Badge background tint
  badgeText: string // Badge text color, readable against badgeBg
}

export const TRAINING_GROUP_COLOR: Record<TrainingGroup, TrainingGroupColor> = {
  BASE: {
    dot: 'bg-sky-500',
    text: 'text-sky-400',
    border: 'border-sky-500',
    borderLeft: 'border-l-sky-500',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-400',
  },
  SPP: {
    dot: 'bg-violet-500',
    text: 'text-violet-400',
    border: 'border-violet-500',
    borderLeft: 'border-l-violet-500',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-400',
  },
  GPP: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    border: 'border-emerald-500',
    borderLeft: 'border-l-emerald-500',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
  },
}

// Not a real block — "hasn't been sorted yet" state, used only where an
// unclassified exercise needs the same visual treatment as a real group
// (e.g. the admin page's "Без блока" section). Muted on purpose so it reads
// as "unset", not as a fourth block.
export const UNASSIGNED_GROUP_COLOR: TrainingGroupColor = {
  dot: 'bg-zinc-500',
  text: 'text-zinc-400',
  border: 'border-zinc-500',
  borderLeft: 'border-l-zinc-500',
  badgeBg: 'bg-zinc-500/15',
  badgeText: 'text-zinc-400',
}

export function trainingGroupColor(group: string | null): TrainingGroupColor {
  return isTrainingGroup(group) ? TRAINING_GROUP_COLOR[group] : UNASSIGNED_GROUP_COLOR
}
