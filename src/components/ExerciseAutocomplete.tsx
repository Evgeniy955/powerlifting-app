'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  // When true, the search box clears back to empty right after a pick
  // instead of filling with the picked name — for an "add another" flow
  // (WeekDayTable/WorkoutView's "Добавить упражнение...") where the field
  // should be immediately ready for the next search. Left off for
  // ExerciseCard's inline exercise-swap editor, where echoing the pick back
  // into the field is what confirms the change before saving.
  clearOnSelect?: boolean
  // The last workout card in a microcycle sits at the bottom of the page, so
  // its add-exercise menu needs to grow upward to remain visible.
  openUpward?: boolean
}

// Coach-facing autocomplete over ExerciseCatalog, used both to add an exercise to a
// workout and to pick which exercise a 1RM should be bound to.
export function ExerciseAutocomplete({
  onSelect,
  placeholder,
  canCreate = false,
  clearOnSelect = false,
  openUpward = false,
}: Props) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ExerciseOption[]>([])
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [menuRect, setMenuRect] = useState<{
    top?: number
    bottom?: number
    left: number
    width: number
  } | null>(null)

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
      setQuery(clearOnSelect ? '' : created.name)
      setOpen(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setCreating(false)
    }
  }

  const menuOpen = open && (options.length > 0 || showCreateOption)

  // Positioned via a portal to document.body instead of `absolute` inside
  // this component's own wrapper — the plain z-index approach (still visible
  // in git history) never reliably won: WeekDayTable's sticky first column
  // and this dropdown are each their own stacking context (position + a
  // z-index establishes one), so a *child's* z-index only ever out-ranks
  // siblings *within that same context* — it can't reach past its own
  // container's box to beat a sibling table row's sticky cell, no matter how
  // high the number. A portal sidesteps the whole table/card stacking-context
  // nesting by rendering the menu as a sibling of <body> instead of a
  // descendant of the row it opened from.
  useLayoutEffect(() => {
    if (!menuOpen || !wrapperRef.current) {
      setMenuRect(null)
      return
    }
    function updateRect() {
      const rect = wrapperRef.current!.getBoundingClientRect()
      setMenuRect({
        top: openUpward ? undefined : rect.bottom,
        bottom: openUpward ? window.innerHeight - rect.top : undefined,
        left: rect.left,
        width: rect.width,
      })
    }
    updateRect()
    // capture: true — the table's horizontal scroll container (and any other
    // scrollable ancestor) fires 'scroll' but doesn't bubble it, only capture.
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [menuOpen, openUpward])

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
            style={{
              top: menuRect.top,
              bottom: menuRect.bottom,
              left: menuRect.left,
              width: menuRect.width,
            }}
            className={`fixed z-50 ${openUpward ? 'mb-1' : 'mt-1'} max-h-64 overflow-auto rounded-lg border border-border bg-surface shadow-elevated animate-scale-in`}
          >
            {options.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(opt)
                    setQuery(clearOnSelect ? '' : opt.name)
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
          </ul>,
          document.body
        )}
      {createError && <p className="mt-1 text-xs text-danger">{createError}</p>}
    </div>
  )
}
