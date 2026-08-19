'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui'

export type ExerciseOption = {
  id: string
  name: string
  category: string | null
  impactCoefficient: number
  trainingGroup: string | null
}

type Props = {
  onSelect: (exercise: ExerciseOption) => void
  placeholder?: string
  // Coach-only: when the search comes up with no exact match, shows a
  // "Создать «...»" option that POSTs a brand-new row to ExerciseCatalog and
  // selects it — mirrors the coach-only restriction already enforced by
  // POST /api/exercises. Athletes (and coaches who leave this unset) only
  // get to pick from what's already in the catalog.
  canCreate?: boolean
}

// Coach-facing autocomplete over ExerciseCatalog, used both to add an exercise to a
// workout and to pick which exercise a 1RM should be bound to.
export function ExerciseAutocomplete({ onSelect, placeholder, canCreate = false }: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ExerciseOption[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCreateError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/exercises?q=${encodeURIComponent(query)}`)
      if (res.ok) setOptions(await res.json())
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const trimmedQuery = query.trim()
  const hasExactMatch = options.some(
    (opt) => opt.name.toLowerCase() === trimmedQuery.toLowerCase()
  )
  const showCreateOption = canCreate && trimmedQuery.length > 0 && !hasExactMatch

  async function handleCreate() {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedQuery }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось создать упражнение')
      }
      const created: ExerciseOption = await res.json()
      onSelect(created)
      setQuery(created.name)
      setOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setCreating(false)
    }
  }

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
      {open && (options.length > 0 || showCreateOption) && (
        // z-30, not z-10: WeekDayTable's sticky first column also sits at z-10,
        // and on the week page every day is a sibling card — with equal
        // z-index, whichever one is later in the DOM wins the tie, so a later
        // day's sticky cells were painting over this dropdown. Needs to win
        // outright, not by DOM-order luck.
        <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface shadow-elevated animate-scale-in">
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
          {showCreateOption && (
            <li className="border-t border-border">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-accent transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                {creating ? 'Создаю...' : `Создать «${trimmedQuery}»`}
              </button>
            </li>
          )}
        </ul>
      )}
      {createError && <p className="mt-1 text-xs text-danger">{createError}</p>}
    </div>
  )
}
