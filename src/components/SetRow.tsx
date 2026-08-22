'use client'

import { Check, X } from 'lucide-react'
import { Input } from '@/components/ui'

export type SetValue = {
  id: string
  setNumber: number
  weight: number
  reps: number
  completed: boolean
}

// Which fields the athlete changed on this set since the coach last looked,
// carrying the previous value (the input already shows the current one) —
// null until the coach views this workout (WorkoutPage marks it seen there).
export type SetChange = { weight?: number; reps?: number }

type Props = {
  set: SetValue
  percentOf1rm: number | null
  rpe: number | null // ИУ for this set, reverse-looked-up from the RPE chart
  changed?: SetChange
  onChange: (id: string, patch: Partial<Pick<SetValue, 'weight' | 'reps' | 'completed'>>) => void
  onRemove: (id: string) => void
}

// A single set row. New sets are added pre-filled with the previous set's
// weight/reps (see POST .../sets) so building e.g. 5x5 doesn't mean retyping
// the same numbers each time; this component itself only reports changes
// upward — the parent owns debounced saving.
export function SetRow({ set, percentOf1rm, rpe, changed, onChange, onRemove }: Props) {
  return (
    <div
      className={`flex items-center gap-2 py-1 ${
        changed ? 'border-l-4 border-l-zone-moderate bg-zone-moderate/10 pl-2' : ''
      }`}
    >
      {/* Kept at full opacity even when completed (the rest of the row dims
          below) so the done state stays the brightest thing in the row.
          pointer-events-auto exempts it from the day-level lock (see the
          pointer-events-none wrapper in WorkoutView) — during an actual
          session you still need to check sets off without unlocking the
          whole day first. */}
      <button
        type="button"
        onClick={() => onChange(set.id, { completed: !set.completed })}
        aria-pressed={set.completed}
        aria-label={`Подход ${set.setNumber}${set.completed ? ' выполнен, нажмите чтобы снять отметку' : ', нажмите чтобы отметить выполненным'}`}
        className={`pointer-events-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
          set.completed
            ? 'border-accent bg-accent text-on-accent shadow-[0_0_10px_-1px_var(--color-accent)]'
            : 'border-border bg-surface-2 text-text-secondary hover:border-accent hover:text-accent'
        }`}
      >
        {set.completed ? <Check className="h-4 w-4" /> : set.setNumber}
      </button>

      <div className={`flex items-center gap-2 ${set.completed ? 'opacity-70' : ''}`}>
        <div className="flex flex-col items-start">
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Вес"
            value={set.weight || ''}
            onChange={(e) => onChange(set.id, { weight: parseFloat(e.target.value) || 0 })}
            fieldSize="sm"
            title={changed?.weight !== undefined ? `Атлет изменил: было ${changed.weight}` : undefined}
            className={`w-20 font-bold text-accent ${
              changed?.weight !== undefined ? 'ring-1 ring-zone-moderate' : ''
            }`}
          />
          {changed?.weight !== undefined && (
            <span className="text-[10px] leading-tight text-zone-moderate">было {changed.weight}</span>
          )}
        </div>

        <span className="text-text-secondary">×</span>

        <div className="flex flex-col items-start">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Повт"
            value={set.reps || ''}
            onChange={(e) => onChange(set.id, { reps: parseInt(e.target.value, 10) || 0 })}
            fieldSize="sm"
            title={changed?.reps !== undefined ? `Атлет изменил: было ${changed.reps}` : undefined}
            className={`w-16 text-text-secondary ${
              changed?.reps !== undefined ? 'ring-1 ring-zone-moderate' : ''
            }`}
          />
          {changed?.reps !== undefined && (
            <span className="text-[10px] leading-tight text-zone-moderate">было {changed.reps}</span>
          )}
        </div>

        <span className="w-12 text-sm text-text-secondary">
          {percentOf1rm !== null ? `${Math.round(percentOf1rm * 100)}%` : '—'}
        </span>

        <span className="w-10 text-sm text-accent" title="ИУ (RPE)">
          {rpe !== null ? rpe : '—'}
        </span>
      </div>

      <button
        onClick={() => onRemove(set.id)}
        aria-label="Удалить подход"
        className="ml-auto text-text-secondary hover:text-danger px-2 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
