'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ban, Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { ExerciseAutocomplete, type ExerciseOption } from './ExerciseAutocomplete'
import type { ExerciseEntryData } from './ExerciseCard'
import type { ExerciseMetrics } from '@/lib/metrics'
import { TRAINING_GROUP_LABEL, isTrainingGroup, trainingGroupColor } from '@/lib/trainingGroups'

// Same intensity-zone coloring as WeekDayTable/MetricsBadge — duplicated
// rather than shared for the same "not worth the indirection" reason as the
// original.
function zoneClass(relativeIntensity: number): string {
  if (relativeIntensity >= 0.95) return 'text-zone-max'
  if (relativeIntensity >= 0.85) return 'text-zone-high'
  if (relativeIntensity >= 0.7) return 'text-zone-moderate'
  return 'text-zone-low'
}

type Props = {
  entry: ExerciseEntryData
  index: number
  metrics: ExerciseMetrics
  maxSets: number
  canEditOneRepMax: boolean
  canCreateExercise: boolean
  // Drag-to-reorder is only meaningful (and only rendered) once the day is
  // unlocked — same gate as every other edit on this row.
  locked: boolean
  // Mirrors WeekDayTable's own `simplified` prop — hides the drag/skip/edit/
  // delete icon row, the per-set remove button, the add-set cell, and all six
  // metric cells (Тонн/Срвес/Инт%/ПМ/КПШ/КО). What's left: the exercise name
  // (with its group dot/index/multiplier) and each set's weight, reps, %1RM.
  simplified: boolean
  isEditing: boolean
  draftExercise: ExerciseOption | null
  draftMultiplier: number
  onStartEdit: (entry: ExerciseEntryData) => void
  onCancelEdit: () => void
  onSaveEdit: (entryId: string) => void
  onDraftExerciseChange: (exercise: ExerciseOption) => void
  onDraftMultiplierChange: (value: number) => void
  onToggleSkipped: (entryId: string, next: boolean) => void
  onRemoveExercise: (entryId: string, exerciseName: string) => void
  onRemoveSet: (entryId: string, setId: string) => void
  onAddSet: (entryId: string) => void
  onUpdateSet: (
    entryId: string,
    setId: string,
    patch: Partial<{ weight: number; reps: number; completed: boolean }>
  ) => void
  onUpdateOneRepMax: (entryId: string, exerciseId: string, value: number) => void
}

// One exercise row of WeekDayTable's spreadsheet-dense table — split out from
// the table itself so useSortable (one drag-and-drop participant per row) can
// be called once per row instead of inside a .map() in the parent, which
// hooks don't allow. The drag handle (GripVertical) is the only element
// wired to dnd-kit's listeners/attributes — the row has a dozen other
// interactive controls (inputs, buttons) that would otherwise fight a
// press-and-drag gesture over the whole `<tr>`.
export function WeekDayTableRow({
  entry,
  index,
  metrics: m,
  maxSets,
  canEditOneRepMax,
  canCreateExercise,
  locked,
  simplified,
  isEditing,
  draftExercise,
  draftMultiplier,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDraftExerciseChange,
  onDraftMultiplierChange,
  onToggleSkipped,
  onRemoveExercise,
  onRemoveSet,
  onAddSet,
  onUpdateSet,
  onUpdateOneRepMax,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: locked,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border last:border-b-0 ${entry.skipped ? 'opacity-50' : ''} ${isDragging ? 'relative z-20 bg-surface-2 shadow-lg' : ''}`}
    >
      <td className="sticky left-0 z-10 w-40 max-w-[10rem] bg-surface px-2 py-1 font-medium align-top">
        <div className="flex w-full flex-col items-start gap-0.5">
          {!simplified && (
            <div className="flex items-center gap-1">
              {/* touch-action:none is required by dnd-kit's pointer sensor —
                  without it, a touch-drag on this handle gets eaten by the
                  browser's own scroll gesture instead. */}
              <button
                type="button"
                {...attributes}
                {...listeners}
                disabled={locked}
                aria-label="Перетащить, чтобы изменить порядок"
                title="Перетащить, чтобы изменить порядок"
                style={{ touchAction: 'none' }}
                className={`flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary transition-colors ${
                  locked ? 'cursor-not-allowed opacity-40' : 'cursor-grab hover:text-accent active:cursor-grabbing'
                }`}
              >
                <GripVertical className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onToggleSkipped(entry.id, !entry.skipped)}
                aria-pressed={entry.skipped}
                title={entry.skipped ? 'Отметить как выполненное' : 'Отметить как пропущенное'}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  entry.skipped
                    ? 'border-danger bg-danger text-on-danger'
                    : 'border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger'
                }`}
              >
                <Ban className="h-2.5 w-2.5" />
              </button>
              <button
                type="button"
                onClick={() => onStartEdit(entry)}
                aria-label="Редактировать упражнение"
                title="Редактировать упражнение"
                className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary transition-colors hover:text-accent"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveExercise(entry.id, entry.exercise.name)}
                aria-label="Убрать упражнение из плана"
                title="Убрать упражнение из плана"
                className="flex h-4 w-4 shrink-0 items-center justify-center text-text-secondary transition-colors hover:text-danger"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
          {isEditing ? (
            <div className="flex w-full flex-col gap-1 rounded border border-border bg-surface-2 p-1">
              <ExerciseAutocomplete
                onSelect={onDraftExerciseChange}
                placeholder={draftExercise?.name ?? entry.exercise.name}
                canCreate={canCreateExercise}
              />
              <div className="flex items-center gap-1">
                <label className="flex items-center gap-1 text-[10px] text-text-secondary">
                  Множ
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draftMultiplier}
                    onChange={(e) => onDraftMultiplierChange(parseFloat(e.target.value) || 1)}
                    className="w-10 min-w-0 rounded border border-border bg-surface px-0.5 py-0.5 text-center text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onSaveEdit(entry.id)}
                  aria-label="Сохранить"
                  title="Сохранить"
                  className="ml-auto text-accent transition-colors hover:text-accent-2"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  aria-label="Отменить"
                  title="Отменить"
                  className="text-text-secondary transition-colors hover:text-danger"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <span className={`block w-full break-words ${entry.skipped ? 'line-through' : ''}`}>
              {/* Block-color dot — Базовые/СФП/ОФП, same palette as
                  the admin exercise page. Nothing shown for an
                  exercise that hasn't been sorted into a block yet,
                  so an unset state doesn't read as a 4th color. */}
              {isTrainingGroup(entry.exercise.trainingGroup) && (
                <span
                  title={TRAINING_GROUP_LABEL[entry.exercise.trainingGroup]}
                  aria-label={TRAINING_GROUP_LABEL[entry.exercise.trainingGroup]}
                  className={`mr-1 inline-block h-2 w-2 shrink-0 rounded-full align-middle ${trainingGroupColor(entry.exercise.trainingGroup).dot}`}
                />
              )}
              <span className="text-text-secondary">{index + 1}. </span>
              {entry.exercise.name}
              {entry.multiplier !== 1 && (
                <span className="ml-1 text-text-secondary">×{entry.multiplier}</span>
              )}
            </span>
          )}
        </div>
      </td>
      {Array.from({ length: maxSets }).map((_, i) => {
        const set = entry.sets[i]
        if (!set) return <td key={i} className="px-0.5 py-0.5" />
        const pct = entry.oneRepMax ? set.weight / entry.oneRepMax : null
        return (
          <td key={i} className="group relative px-0.5 py-0.5 align-top">
            {!simplified && (
              <button
                onClick={() => onRemoveSet(entry.id, set.id)}
                aria-label="Удалить подход"
                className="absolute right-0 top-0 hidden text-text-secondary hover:text-danger group-hover:block"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <div className="flex flex-col items-center gap-0.5">
              {/* Set-number pill doubles as the "done" toggle (swaps to a
                  checkmark when tapped) — sits in normal flow above the
                  weight input instead of overlapping it, and gives a
                  properly sized tap target on mobile. Kept at full opacity
                  even when completed (the rest of the row dims below) so
                  the done state stays the brightest thing in the row.
                  pointer-events-auto exempts it from the week-level lock
                  (see the pointer-events-none wrapper below) — during an
                  actual session you still need to check sets off without
                  unlocking the whole day/week first. */}
              <button
                type="button"
                onClick={() => onUpdateSet(entry.id, set.id, { completed: !set.completed })}
                aria-pressed={set.completed}
                aria-label={`Подход ${i + 1}${set.completed ? ' выполнен, нажмите чтобы снять отметку' : ', нажмите чтобы отметить выполненным'}`}
                className={`pointer-events-auto flex h-5 w-16 items-center justify-center rounded border text-[10px] font-medium transition-colors ${
                  set.completed
                    ? 'border-accent bg-accent text-on-accent shadow-[0_0_8px_-1px_var(--color-accent)]'
                    : 'border-border bg-surface-2 text-text-secondary hover:border-accent hover:text-accent'
                }`}
              >
                {set.completed ? <Check className="h-3 w-3" /> : i + 1}
              </button>
              <div className={`flex flex-col items-center gap-0.5 ${set.completed ? 'opacity-70' : ''}`}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={set.weight || ''}
                  onChange={(e) =>
                    onUpdateSet(entry.id, set.id, { weight: parseFloat(e.target.value) || 0 })
                  }
                  className={`w-16 min-w-0 rounded border px-0.5 py-0.5 text-center text-sm font-bold text-accent outline-none focus:border-accent focus:ring-1 focus:ring-accent ${set.completed ? 'border-zone-low bg-surface-3' : 'border-border bg-surface-2'}`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={set.reps || ''}
                  onChange={(e) =>
                    onUpdateSet(entry.id, set.id, { reps: parseInt(e.target.value, 10) || 0 })
                  }
                  className={`w-16 min-w-0 rounded border px-0.5 py-0.5 text-center text-sm text-text-secondary outline-none focus:border-accent focus:ring-1 focus:ring-accent ${set.completed ? 'border-zone-low bg-surface-3' : 'border-border bg-surface-2'}`}
                />
                <span className={`text-xs ${pct !== null ? zoneClass(pct) : 'text-text-secondary'}`}>
                  {pct !== null ? `${Math.round(pct * 100)}%` : '—'}
                </span>
              </div>
            </div>
          </td>
        )
      })}
      {!simplified && (
        <>
          <td className="px-0.5 py-0.5 align-top">
            <button
              onClick={() => onAddSet(entry.id)}
              aria-label="Добавить подход"
              title="Добавить подход с теми же весом/повторами, что и последний"
              className="mt-1 text-text-secondary transition-colors hover:text-accent"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </td>
          <td className="px-1.5 py-1 text-right align-top">{m.tonnage}</td>
          <td className="px-1.5 py-1 text-right align-top">{m.avgWeight}</td>
          <td className={`px-1.5 py-1 text-right align-top ${zoneClass(m.relativeIntensity)}`}>
            {Math.round(m.relativeIntensity * 100)}%
          </td>
          <td className="px-1.5 py-1 text-right align-top">
            {canEditOneRepMax ? (
              <input
                type="number"
                inputMode="decimal"
                value={entry.oneRepMax || ''}
                onChange={(e) =>
                  onUpdateOneRepMax(entry.id, entry.exercise.id, parseFloat(e.target.value) || 0)
                }
                className="w-14 min-w-0 rounded border-none bg-accent-2 px-1 py-0.5 text-center text-sm font-bold text-on-accent-2 outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <span className="rounded bg-accent-2 px-1.5 py-0.5 font-bold text-on-accent-2">
                {entry.oneRepMax ?? '—'}
              </span>
            )}
          </td>
          <td className="px-1.5 py-1 text-right align-top">{m.kpsh}</td>
          <td className="px-1.5 py-1 text-right align-top">{m.loadCoefficient}</td>
        </>
      )}
    </tr>
  )
}
