'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, Search, Trash2, X } from 'lucide-react'
import { Badge, Card, Input, Select, useToast } from '@/components/ui'
import { classifyMainLift, type MainLift } from '@/lib/mainLifts'
import {
  TRAINING_GROUPS,
  TRAINING_GROUP_LABEL,
  type TrainingGroup,
} from '@/lib/trainingGroups'

export type AdminExercise = {
  id: string
  name: string
  category: string | null
  impactCoefficient: number
  trainingGroup: string | null
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

const UNASSIGNED = 'UNASSIGNED' as const
type GroupKey = TrainingGroup | typeof UNASSIGNED

const GROUP_ORDER: GroupKey[] = [...TRAINING_GROUPS, UNASSIGNED]
const GROUP_LABEL: Record<GroupKey, string> = {
  ...TRAINING_GROUP_LABEL,
  UNASSIGNED: 'Без блока',
}

// Coach-only exercise catalog management: rename, retag category/impact
// coefficient, delete unused rows, and — the point of this component —
// "move" an exercise between the Базовые/СФП/ОФП training blocks via a
// per-card select, grouped into one section per block (plus "Без блока" for
// anything not yet classified). Renaming/moving needs no propagation step:
// ExerciseEntry/Athlete1RM only ever store the exerciseId and read
// name/category/trainingGroup live off this table via the relation, so a
// save shows up immediately everywhere the exercise is used. Deleting a row
// that's actually in use is blocked by the API (409) rather than cascading
// through training history.
export function AdminExercisesView({ initialExercises }: Props) {
  const toast = useToast()
  const [exercises, setExercises] = useState(initialExercises)
  const [query, setQuery] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftImpact, setDraftImpact] = useState(1)

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? exercises.filter(
          (ex) => ex.name.toLowerCase().includes(q) || (ex.category ?? '').toLowerCase().includes(q)
        )
      : exercises

    const byGroup: Record<GroupKey, AdminExercise[]> = {
      BASE: [],
      SPP: [],
      GPP: [],
      UNASSIGNED: [],
    }
    for (const ex of filtered) {
      const key: GroupKey =
        ex.trainingGroup === 'BASE' || ex.trainingGroup === 'SPP' || ex.trainingGroup === 'GPP'
          ? ex.trainingGroup
          : UNASSIGNED
      byGroup[key].push(ex)
    }
    return byGroup
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
    try {
      const res = await fetch(`/api/admin/exercises/${ex.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          category: draftCategory.trim() || null,
          impactCoefficient: draftImpact,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Не удалось сохранить изменения'
        setError(message)
        toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
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
    } catch (e) {
      console.error('saveEdit failed', e)
      const message = 'Проблема с сетью — изменения не сохранены'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  // The "move to block" action — a coach picks Базовые/СФП/ОФП/Без блока
  // from the select and this fires immediately, no separate save step.
  async function moveToGroup(ex: AdminExercise, group: TrainingGroup | null) {
    setError(null)
    const previous = ex.trainingGroup
    setExercises((prev) =>
      prev.map((x) => (x.id === ex.id ? { ...x, trainingGroup: group } : x))
    )

    function rollback() {
      setExercises((prev) =>
        prev.map((x) => (x.id === ex.id ? { ...x, trainingGroup: previous } : x))
      )
    }

    try {
      const res = await fetch(`/api/admin/exercises/${ex.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainingGroup: group }),
      })

      if (!res.ok) {
        // Roll back — the optimistic move above already re-sorted the card
        // into the target section.
        rollback()
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Не удалось переместить упражнение'
        setError(message)
        toast({ title: 'Не удалось переместить', description: message, variant: 'error' })
      }
    } catch (e) {
      console.error('moveToGroup failed', e)
      rollback()
      const message = 'Проблема с сетью — упражнение не перемещено'
      setError(message)
      toast({ title: 'Не удалось переместить', description: message, variant: 'error' })
    }
  }

  async function deleteExercise(ex: AdminExercise) {
    setError(null)

    const usage = ex._count.exerciseEntries + ex._count.oneRepMaxes
    let force = false

    if (usage > 0) {
      const confirmed = window.confirm(
        `«${ex.name}» используется (записей в тренировках: ${ex._count.exerciseEntries}, ` +
          `1ПМ: ${ex._count.oneRepMaxes}). Вы уверены, что хотите удалить? Упражнение ` +
          `пропадёт и из истории тренировок, и из сохранённых 1ПМ — отменить это будет нельзя.`
      )
      if (!confirmed) return
      force = true
    } else {
      if (!window.confirm(`Удалить упражнение «${ex.name}» из каталога?`)) return
    }

    setPendingId(ex.id)
    try {
      const res = await fetch(`/api/admin/exercises/${ex.id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Не удалось удалить упражнение'
        setError(message)
        toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
        return
      }

      setExercises((prev) => prev.filter((x) => x.id !== ex.id))
      toast({ title: `«${ex.name}» удалено`, variant: 'success' })
    } catch (e) {
      console.error('deleteExercise failed', e)
      const message = 'Проблема с сетью — упражнение не удалено'
      setError(message)
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  function renderCard(ex: AdminExercise) {
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
                <Select
                  value={ex.trainingGroup ?? ''}
                  onChange={(e) =>
                    moveToGroup(ex, e.target.value === '' ? null : (e.target.value as TrainingGroup))
                  }
                  aria-label="Переместить в блок"
                  fieldSize="sm"
                  className="mt-2"
                >
                  <option value="">Без блока</option>
                  {TRAINING_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {TRAINING_GROUP_LABEL[g]}
                    </option>
                  ))}
                </Select>
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
                  title={
                    usage > 0
                      ? 'Используется — удаление сотрёт историю тренировок и 1ПМ'
                      : 'Удалить упражнение'
                  }
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
  }

  const totalShown = GROUP_ORDER.reduce((sum, key) => sum + grouped[key].length, 0)

  return (
    <div className="space-y-5">
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

      {totalShown === 0 ? (
        <p className="text-sm text-text-secondary">Ничего не найдено.</p>
      ) : (
        GROUP_ORDER.map((key) => {
          const items = grouped[key]
          if (items.length === 0) return null
          return (
            <div key={key} className="space-y-2">
              <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wide text-text-secondary">
                {GROUP_LABEL[key]}
                <span className="text-xs font-normal normal-case text-text-secondary">
                  {items.length}
                </span>
              </h2>
              <ul className="animate-fade-in space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
                {items.map(renderCard)}
              </ul>
            </div>
          )
        })
      )}
    </div>
  )
}
