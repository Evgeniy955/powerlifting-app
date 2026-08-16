'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui'

export type ExerciseOption = {
  id: string
  name: string
  category: string | null
  impactCoefficient: number
}

type Props = {
  onSelect: (exercise: ExerciseOption) => void
  placeholder?: string
}

// Coach-facing autocomplete over ExerciseCatalog, used both to add an exercise to a
// workout and to pick which exercise a 1RM should be bound to.
export function ExerciseAutocomplete({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ExerciseOption[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/exercises?q=${encodeURIComponent(query)}`)
      if (res.ok) setOptions(await res.json())
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Упражнение...'}
        className="w-full"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-elevated animate-scale-in">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(opt)
                  setQuery(opt.name)
                  setOpen(false)
                }}
                className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
              >
                {opt.name}
                {opt.category && (
                  <span className="ml-2 text-text-secondary text-xs">{opt.category}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
