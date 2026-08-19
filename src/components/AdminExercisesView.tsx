'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, Search, Trash2, X } from 'lucide-react'
import { Badge, Card, Input } from '@/components/ui'
import { classifyMainLift, type MainLift } from '@/lib/mainLifts'

export type AdminExercise = {
  id: string
  name: string
  category: string | null
  impactCoefficient: number
  _count: { exerciseEntries: number; oneRepMaxes: number }
}

type Props = {
  initialExercises: AdminExercise[]
}

const LIFT_LABEL: Record<MainLift, string> = {
  squat: 'Присед',
  bench: 'Жим',
  deadlift: 'Тяга',
}

// Coach-only exercise catalog management: rename, retag category/impact
// coefficient, and delete unused rows. Renaming here is the whole feature —
// ExerciseEntry/Athlete1RM only ever store the exerciseId and read the name
// live off this table via the relation, so a save here shows up immediately
// in every program/week/day that uses this exercise, no extra propagation
// needed. Deleting a row that's actually in use is blocked by the API
// (409) rather than cascading through training history.
export function AdminExercisesView({ initialExercises }: Props) {
  const [exercises, setExercises] = useState(initialExercises)
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftImpact, setDraftImpact] = useState(1)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return exercises
    return exercises.filter(
      (ex) => ex.name.toLowerCase().includes(q) || (ex.category ?? '').toLowerCase().includes(q)
    )
  }, [exercises, query])

  function startEdit(ex: AdminExercise) {
    setError(null)
    setEditingId(ex.id)
    setDraftName(ex.name)
    setDraftCategory(ex.category ?? '')
    setDraftImpact(ex.impactCoefficient)
  }

  async function saveEdit(ex: AdminExercise) {
    setError(null)
    setPendingId(ex.id)
    const res = await fetch(`/api/admin/exercises/${ex.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: draftName,
        category: draftCategory.trim() || null,
        impactCoefficient: draftImpact,
      }),
    })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось сохранить изменения')
      return
    }

    const updated = await res.json()
    setExercises((prev) =>
      prev.map((x) =>
        x.id === ex.id
          ? {
              ...x,
              name: updated.name,
              category: updated.category,
              impactCoefficient: updated.impactCoefficient,
            }
          : x
      )
    )
    setEditingId(null)
  }

  async function deleteExercise(ex: AdminExercise) {
    setError(null)

    const usage = ex._count.exerciseEntries + ex._count.oneRepMaxes
    if (usage > 0) {
      window.alert(
        `«${ex.name}» используется (записей в тренировках: ${ex._count.exerciseEntries}, ` +
          `1ПМ: ${ex._count.oneRepMaxes}) — удалить нельзя, чтобы не потерять историю ` +
          `тренировок. Можно переименовать вместо удаления.`
      )
      return
    }
    if (!window.confirm(`Удалить упражнение «${ex.name}» из каталога?`)) return

    setPendingId(ex.id)
    const res = await fetch(`/api/admin/exercises/${ex.id}`, { method: 'DELETE' })
    setPendingId(null)

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Не удалось удалить упражнение')
      return
    }

    setExercises((prev) => prev.filter((x) => x.id !== ex.id))
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по названию или категории..."
          className="w-full pl-8"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
        {filtered.map((ex) => {
          const lift = classifyMainLift(ex.name)
          const usage = ex._count.exerciseEntries + ex._count.oneRepMaxes
          return (
            <li key={ex.id}>
              <Card padding="sm" className="space-y-2">
                {editingId === ex.id ? (
                  <div className="space-y-2">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Название"
                      fieldSize="sm"
                      className="w-full"
                    />
                    <Input
                      value={draftCategory}
                      onChange={(e) => setDraftCategory(e.target.value)}
                      placeholder="Категория"
                      fieldSize="sm"
                      className="w-full"
                    />
                    <label className="flex items-center gap-2 text-xs text-text-secondary">
                      Коэфф. воздействия
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={draftImpact}
                        onChange={(e) => setDraftImpact(parseFloat(e.target.value) || 1)}
                        fieldSize="sm"
                        className="w-20"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pendingId === ex.id}
                        onClick={() => saveEdit(ex)}
                        className="inline-flex items-center gap-1 text-xs text-accent transition-colors hover:underline disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Сохранить
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-danger"
                      >
                        <X className="h-3.5 w-3.5" /> Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{ex.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {ex.category && <Badge tone="neutral">{ex.category}</Badge>}
                        {lift && <Badge tone="accent">{LIFT_LABEL[lift]}</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">
                        {usage > 0
                          ? `Используется: записей в тренировках — ${ex._count.exerciseEntries}, 1ПМ — ${ex._count.oneRepMaxes}`
                          : 'Не используется'}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(ex)}
                        aria-label="Редактировать упражнение"
                        title="Редактировать упражнение"
                        className="text-text-secondary transition-colors hover:text-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === ex.id}
                        onClick={() => deleteExercise(ex)}
                        aria-label="Удалить упражнение"
                        title={usage > 0 ? 'Используется — удалить нельзя' : 'Удалить упражнение'}
                        className="text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            </li>
          )
        })}

        {filtered.length === 0 && (
          <li className="text-sm text-text-secondary">Ничего не найдено.</li>
        )}
      </ul>
    </div>
  )
}
