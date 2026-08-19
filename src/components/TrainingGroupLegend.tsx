import { TRAINING_GROUPS, TRAINING_GROUP_LABEL, TRAINING_GROUP_COLOR } from '@/lib/trainingGroups'

// Small "what do the dots mean" key for WeekDayTable's per-exercise block
// dots — shown once above the week's day tables rather than repeated on
// every day, since every day on the page shares the same palette.
export function TrainingGroupLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-text-secondary">
      {TRAINING_GROUPS.map((g) => (
        <span key={g} className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${TRAINING_GROUP_COLOR[g].dot}`} />
          {TRAINING_GROUP_LABEL[g]}
        </span>
      ))}
    </div>
  )
}
