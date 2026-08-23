'use client'

import { useMemo, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Ban, Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { SetRow, type SetChange, type SetValue } from './SetRow'
import { MetricsBadge } from './MetricsBadge'
import { ExerciseAutocomplete, type ExerciseOption } from './ExerciseAutocomplete'
import { Card, Input } from '@/components/ui'
import { computeExerciseMetrics } from '@/lib/metrics'
import { groupSets } from '@/lib/setGrouping'
import type { RpePoint } from '@/lib/rpe'

export type ExerciseEntryData = {
  id: string
  multiplier: number
  // Athlete didn't get to this exercise (ran out of time, gym was busy, etc.) —
  // distinct from just having no sets logged yet.
  skipped: boolean
  exercise: {
    id: string
    name: string
    category: string | null
    impactCoefficient: number
    // "BASE" | "SPP" | "GPP" | null — used by WeekDayTable's Итого row to
    // decide which exercises count toward Тоннаж/Срвес/Инт% (only Базовые +
    // СФП); not used by this card itself.
    trainingGroup: string | null
  }
  oneRepMax: number | null
  sets: SetValue[]
}

type Props = {
  entry: ExerciseEntryData
  rpeTable: RpePoint[]
  // 1-based position of this exercise within the day, for display only (e.g. "1.
  // Приседания") — mirrors the "Порядок" numbering from the original spreadsheet.
  // Derived from render order rather than entry.orderIndex directly, since
  // orderIndex can have gaps/different bases depending on how the entry was
  // created (import vs. manual add).
  position: number
  // Removes this exercise from the day's plan (ExerciseEntry row + its sets) —
  // not the ExerciseCatalog entry, which stays intact for every other day/athlete.
  onRemove: (entryId: string) => void
  // Coach-only: lets the edit-exercise autocomplete create a brand-new
  // ExerciseCatalog row when the search comes up empty.
  canCreateExercise?: boolean
  // Coach-only "athlete changed this since you last looked" signal, sourced
  // from ChangeLog by the workout page and cleared (seenByCoach) the moment
  // it's fetched — so this highlight is a one-time "here's what's new" cue,
  // not a persistent state. Keyed by SetEntry id.
  changedSets?: Record<string, SetChange>
  // This exercise itself is what the athlete added (ad-hoc, not planned by
  // the coach) since the coach last looked.
  isNewExercise?: boolean
  // "Упрощённый режим" — same shared flag as WeekDayTable/WeekDayTableRow's
  // `simplified` prop. Drops the drag/skip/edit/delete icon row, the
  // "1ПМ не задан"/"Пропущено"/"добавлено атлетом" badges, the add-set
  // button, and the MetricsBadge summary. Left in place: exercise name,
  // position number, and each set's weight/reps/%1RM (see SetRow's own
  // `simplified` prop).
  simplified?: boolean
  // "Компактный режим" — replaces the per-set SetRow list with consecutive
  // same weight+reps sets collapsed into one "вес / countхповт / %1ПМ" line
  // (see groupSets). Independent of `simplified`: it only changes how the
  // sets themselves render, not the header icons/add-set button/
  // MetricsBadge, which stay governed by `simplified` as before.
  compact?: boolean
}

// One exercise block in the day view: dynamic set list ("+ Добавить подход",
// which duplicates the last set's weight/reps — see the sets route — so a
// coach programming e.g. 5x5 doesn't have to retype the same numbers into
// every row), reactive metrics recomputed on every keystroke, debounced
// persistence to the API.
export function ExerciseCard({
  entry,
  rpeTable,
  position,
  onRemove,
  canCreateExercise = false,
  changedSets,
  isNewExercise = false,
  simplified = false,
  compact = false,
}: Props) {
  const [sets, setSets] = useState<SetValue[]>(entry.sets)
  const [skipped, setSkipped] = useState(entry.skipped)
  // Which catalog exercise this entry points to and its "Множ" multiplier —
  // local so an edit shows up immediately without a page reload; entry itself
  // is only the initial value from the server.
  const [exercise, setExercise] = useState(entry.exercise)
  const [multiplier, setMultiplier] = useState(entry.multiplier)
  const [editing, setEditing] = useState(false)
  const [draftExercise, setDraftExercise] = useState<ExerciseOption | null>(null)
  const [draftMultiplier, setDraftMultiplier] = useState(entry.multiplier)
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Drag-to-reorder — the handle (GripVertical, next to the skip toggle) is
  // the only element wired to listeners/attributes, not the whole card,
  // since the card is full of its own interactive controls (inputs,
  // buttons). Card itself isn't a forwardRef component, so the sortable
  // ref/transform lands on a plain wrapper div around it instead of on Card
  // directly. Locking is handled by the parent (WorkoutView) disabling
  // pointer-events on the whole entries grid — no separate `disabled` flag
  // needed here.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  async function toggleSkipped() {
    const next = !skipped
    setSkipped(next)
    await fetch(`/api/exercise-entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skipped: next }),
    })
  }

  async function handleRemove() {
    if (!window.confirm(`Убрать «${exercise.name}» из плана на этот день?`)) return
    onRemove(entry.id)
    await fetch(`/api/exercise-entries/${entry.id}`, { method: 'DELETE' })
  }

  function startEditing() {
    setDraftExercise(null)
    setDraftMultiplier(multiplier)
    setEditing(true)
  }

  async function saveEdit() {
    const nextExercise = draftExercise ?? exercise
    const nextMultiplier = draftMultiplier
    setExercise(nextExercise)
    setMultiplier(nextMultiplier)
    setEditing(false)
    await fetch(`/api/exercise-entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: nextExercise.id, multiplier: nextMultiplier }),
    })
  }

  const metrics = useMemo(
    () =>
      computeExerciseMetrics(
        {
          sets: sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          oneRepMax: entry.oneRepMax ?? 0,
          impactCoefficient: exercise.impactCoefficient,
          multiplier,
        },
        rpeTable
      ),
    [sets, entry.oneRepMax, exercise.impactCoefficient, multiplier, rpeTable]
  )

  const compactGroups = useMemo(() => groupSets(sets, entry.oneRepMax), [sets, entry.oneRepMax])

  // Per-set ИУ (RPE), shown next to each set. Comes straight out of the same
  // computeExerciseMetrics call above (metrics.fatiguePerSet), so the value next
  // to each set and the aggregate under the block are always consistent —
  // includes the +0.25-per-set fatigue accumulation, not just an independent
  // per-set lookup.
  const perSetRpe = useMemo(() => {
    const map = new Map<string, number | null>()
    sets.forEach((s, idx) => {
      map.set(s.id, metrics.fatiguePerSet[idx] ?? null)
    })
    return map
  }, [sets, metrics.fatiguePerSet])

  function updateSetLocally(
    id: string,
    patch: Partial<Pick<SetValue, 'weight' | 'reps' | 'completed'>>
  ) {
    setSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))

    // Debounce the network write per-set so live metrics feel instant while
    // typing but we don't spam the API on every keystroke.
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(() => {
      fetch(`/api/sets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    }, 400)
  }

  async function addSet() {
    const res = await fetch(`/api/exercise-entries/${entry.id}/sets`, { method: 'POST' })
    if (res.ok) {
      const newSet = await res.json()
      setSets((prev) => [...prev, newSet])
    }
  }

  async function removeSet(id: string) {
    setSets((prev) => prev.filter((s) => s.id !== id))
    await fetch(`/api/sets/${id}`, { method: 'DELETE' })
  }

  return (
    <div ref={setNodeRef} style={sortableStyle} className={isDragging ? 'relative z-20' : undefined}>
      <Card
        className={`space-y-3 animate-slide-up ${skipped ? 'opacity-60' : ''} ${
          isNewExercise ? 'border-l-4 border-l-zone-moderate' : ''
        } ${isDragging ? 'shadow-lg' : ''}`}
      >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {!simplified && (
            <>
              {/* touch-action:none is required by dnd-kit's pointer sensor —
                  without it, a touch-drag on this handle gets eaten by the
                  browser's own scroll gesture instead. */}
              <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label="Перетащить, чтобы изменить порядок"
                title="Перетащить, чтобы изменить порядок"
                style={{ touchAction: 'none' }}
                className="mt-0.5 flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-text-secondary transition-colors hover:text-accent active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleSkipped}
                aria-pressed={skipped}
                title={skipped ? 'Отметить как выполненное' : 'Отметить как пропущенное'}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  skipped
                    ? 'border-danger bg-danger text-on-danger'
                    : 'border-border bg-surface-2 text-text-secondary hover:border-danger hover:text-danger'
                }`}
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <h3
            className={`min-w-0 break-words font-display text-base uppercase tracking-wide ${skipped ? 'line-through' : ''}`}
          >
            <span className="mr-1.5 text-text-secondary">{position}.</span>
            {exercise.name}
          </h3>
        </div>
        {!simplified && (
          <div className="flex shrink-0 items-center gap-2">
            {isNewExercise && (
              <span className="rounded-full bg-zone-moderate/20 px-2 py-0.5 text-xs font-medium text-zone-moderate">
                добавлено атлетом
              </span>
            )}
            {entry.oneRepMax === null && !skipped && (
              <span className="text-xs text-zone-moderate">1ПМ не задан</span>
            )}
            {skipped && <span className="text-xs text-danger">Пропущено</span>}
            <button
              type="button"
              onClick={startEditing}
              aria-label="Редактировать упражнение"
              title="Редактировать упражнение"
              className="text-text-secondary transition-colors hover:text-accent"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Убрать упражнение из плана"
              title="Убрать упражнение из плана"
              className="text-text-secondary transition-colors hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!simplified && editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2 p-2">
          <div className="min-w-[10rem] flex-1">
            <ExerciseAutocomplete
              onSelect={setDraftExercise}
              placeholder={draftExercise?.name ?? exercise.name}
              canCreate={canCreateExercise}
            />
          </div>
          <label className="flex items-center gap-1 text-xs text-text-secondary">
            Множ
            <Input
              type="number"
              inputMode="decimal"
              value={draftMultiplier}
              onChange={(e) => setDraftMultiplier(parseFloat(e.target.value) || 1)}
              fieldSize="sm"
              className="w-16"
            />
          </label>
          <button
            type="button"
            onClick={saveEdit}
            aria-label="Сохранить"
            title="Сохранить"
            className="text-accent transition-colors hover:text-accent-2"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            aria-label="Отменить"
            title="Отменить"
            className="text-text-secondary transition-colors hover:text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {compact ? (
        // Read-only, column-aligned: вес / countхповт / %1ПМ, one line per
        // group. No inputs here — editing a set means turning compact off,
        // same as simplified hiding its own set of controls.
        <div className="space-y-1 text-sm">
          {compactGroups.map((g, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-16 text-right font-bold text-accent">{g.weight}кг</span>
              <span className="w-12 text-text-secondary">
                {g.count}×{g.reps}
              </span>
              <span className="w-12 text-right text-text-secondary">
                {g.percentOf1rm !== null ? `${Math.round(g.percentOf1rm * 100)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {sets.map((set) => (
            <SetRow
              key={set.id}
              set={set}
              percentOf1rm={entry.oneRepMax ? set.weight / entry.oneRepMax : null}
              rpe={perSetRpe.get(set.id) ?? null}
              changed={changedSets?.[set.id]}
              onChange={updateSetLocally}
              onRemove={removeSet}
              simplified={simplified}
            />
          ))}
        </div>
      )}

      {!simplified && (
        <>
          <button
            onClick={addSet}
            title="Добавить подход с теми же весом/повторами, что и последний"
            className="inline-flex items-center gap-1 text-sm text-accent transition-colors hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Добавить подход
          </button>

          <MetricsBadge {...metrics} />
        </>
      )}
      </Card>
    </div>
  )
}
