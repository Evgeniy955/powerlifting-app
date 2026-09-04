'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui'

export type GymExerciseOption = {
  id: string
  name: string
  category: string | null
}

type Props = {
  onSelect: (exercise: GymExerciseOption) => void
  placeholder?: string
  // Pre-fills the search box (and fires the initial search) — used on the
  // import-review screen to open already showing whatever name the fuzzy
  // matcher suggested, or the raw parsed name when it didn't, so the coach
  // sees the field pre-populated with a sensible search instead of empty.
  defaultQuery?: string
  // Coach-only: no exact match in the results shows a "Создать «...»"
  // option that POSTs a brand-new row to GymExerciseCatalog and selects it —
  // mirrors ExerciseAutocomplete's canCreate on the powerlifting side.
  canCreate?: boolean
}

// Same live-search-over-the-catalog-with-inline-create pattern as
// ExerciseAutocomplete (used to add an exercise to a workout, or bind a
// 1RM), just pointed at GymExerciseCatalog via /api/admin/gym-exercises
// instead of ExerciseCatalog via /api/exercises. Used on the gym
// import-review screen so a coach resolving an unmatched name can search
// the *whole* catalog for a near-match — not just accept or reject the
// single best-guess findPossibleDuplicate() suggestion — or create a new
// exercise inline without leaving the review list.
export function GymExerciseAutocomplete({
  onSelect,
  placeholder,
  defaultQuery = '',
  canCreate = true,
}: Props) {
  const [query, setQuery] = useState(defaultQuery)
  const [options, setOptions] = useState<GymExerciseOption[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)

  useEffect(() => {
    setCreateError(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/gym-exercises?q=${encodeURIComponent(query)}`)
      if (res.ok) setOptions(await res.json())
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const trimmedQuery = query.trim()
  const hasExactMatch = options.some((opt) => opt.name.toLowerCase() === trimmedQuery.toLowerCase())
  const showCreateOption = canCreate && trimmedQuery.length > 0 && !hasExactMatch

  async function handleCreate() {
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/admin/gym-exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedQuery }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось создать упражнение')
      }
      const created: GymExerciseOption = await res.json()
      onSelect(created)
      setQuery(created.name)
      setOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setCreating(false)
    }
  }

  const menuOpen = open && (options.length > 0 || showCreateOption)

  // Portal to document.body so the menu can escape this card's own
  // overflow-auto scroll container on the review list — see
  // ExerciseAutocomplete for the fuller rationale (stacking contexts).
  useLayoutEffect(() => {
    if (!menuOpen || !wrapperRef.current) {
      setMenuRect(null)
      return
    }
    function updateRect() {
      const rect = wrapperRef.current!.getBoundingClientRect()
      setMenuRect({ top: rect.bottom, left: rect.left, width: rect.width })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [menuOpen])

  return (
    <div className="relative" ref={wrapperRef}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? 'Упражнение...'}
        className="w-full"
      />
      {menuOpen &&
        menuRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
            className="fixed z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-surface shadow-elevated animate-scale-in"
          >
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
                  {opt.category && <span className="ml-2 text-text-secondary text-xs">{opt.category}</span>}
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
          </ul>,
          document.body
        )}
      {createError && <p className="mt-1 text-xs text-danger">{createError}</p>}
    </div>
  )
}
