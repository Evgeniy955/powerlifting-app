'use client'

import { X } from 'lucide-react'
import { Input } from '@/components/ui'

export type SetValue = {
  id: string
  setNumber: number
  weight: number
  reps: number
}

type Props = {
  set: SetValue
  percentOf1rm: number | null
  rpe: number | null // ИУ for this set, reverse-looked-up from the RPE chart
  onChange: (id: string, patch: Partial<Pick<SetValue, 'weight' | 'reps'>>) => void
  onRemove: (id: string) => void
}

// A single set row. Deliberately starts empty when added (no auto-fill from the
// previous set) and only reports changes upward — the parent owns debounced saving.
export function SetRow({ set, percentOf1rm, rpe, onChange, onRemove }: Props) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-6 text-text-secondary text-sm">{set.setNumber}</span>

      <Input
        type="number"
        inputMode="decimal"
        placeholder="Вес"
        value={set.weight || ''}
        onChange={(e) => onChange(set.id, { weight: parseFloat(e.target.value) || 0 })}
        fieldSize="sm"
        className="w-20 font-bold text-accent"
      />

      <span className="text-text-secondary">×</span>

      <Input
        type="number"
        inputMode="numeric"
        placeholder="Повт"
        value={set.reps || ''}
        onChange={(e) => onChange(set.id, { reps: parseInt(e.target.value, 10) || 0 })}
        fieldSize="sm"
        className="w-16 text-text-secondary"
      />

      <span className="w-12 text-sm text-text-secondary">
        {percentOf1rm !== null ? `${Math.round(percentOf1rm * 100)}%` : '—'}
      </span>

      <span className="w-10 text-sm text-accent" title="ИУ (RPE)">
        {rpe !== null ? rpe : '—'}
      </span>

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
