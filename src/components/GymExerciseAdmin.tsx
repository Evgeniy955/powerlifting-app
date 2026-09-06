'use client'

import { useMemo, useState } from 'react'
import { Check, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, Input, useToast } from '@/components/ui'

type GymExercise = {
  id: string
  name: string
  category: string | null
  archivedAt: string | Date | null
  _count: { exercises: number; maxes: number }
}

// Coach-only gym exercise catalog management — rename, retag category,
// archive/delete rows. Mirrors AdminExercisesView (the powerlifting side's
// catalog), minus the training-group sorting that side has and this one
// doesn't need. Renaming needs no propagation step: GymExerciseEntry/
// GymClientMax only ever store the exerciseId and read name/category live
// off GymExerciseCatalog via the relation, so a save shows up immediately
// everywhere the exercise is used. Deleting a row that's actually in use
// archives it instead (archivedAt set) — existing workouts/maxes keep
// pointing at it and keep resolving its name live, it just disappears from
// the picker for new entries. An unused row is hard-deleted right away, same
// as before. Archived rows stay listed here (greyed out) with a restore
// action.
export function GymExerciseAdmin({ initial }: { initial: GymExercise[] }) {
  const toast = useToast()
  const [items, setItems] = useState(initial)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftCategory, setDraftCategory] = useState('')

  // Same search behavior as the powerlifting side's AdminExercisesView:
  // client-side filter by name or category, case-insensitive. The full list
  // (initial) is small enough for a coach's catalog that fetching it once
  // and filtering in the browser is simpler than a server round trip per
  // keystroke. Active exercises sort before archived ones (each group still
  // alphabetical, since the initial list already comes in name order).
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? items.filter(
          (item) => item.name.toLowerCase().includes(q) || (item.category ?? '').toLowerCase().includes(q)
        )
      : items
    return [...base].sort((a, b) => Number(!!a.archivedAt) - Number(!!b.archivedAt))
  }, [items, query])

  async function add() {
    if (!name.trim()) return
    setError(null)
    const res = await fetch('/api/admin/gym-exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(body.error ?? 'Не удалось добавить упражнение')
      return
    }
    setItems((prev) => [...prev, { ...body, _count: body._count ?? { exercises: 0, maxes: 0 } }])
    setName('')
    setCategory('')
  }

  function startEdit(item: GymExercise) {
    setError(null)
    setEditingId(item.id)
    setDraftName(item.name)
    setDraftCategory(item.category ?? '')
  }

  async function saveEdit(item: GymExercise) {
    setError(null)
    setPendingId(item.id)
    try {
      const res = await fetch(`/api/admin/gym-exercises/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draftName, category: draftCategory.trim() || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось сохранить изменения'
        setError(message)
        toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
        return
      }
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, name: body.name, category: body.category } : x))
      )
      setEditingId(null)
      toast({ title: 'Изменения сохранены — обновились все планы, где используется упражнение', variant: 'success' })
    } catch {
      const message = 'Проблема с сетью — изменения не сохранены'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  async function deleteExercise(item: GymExercise) {
    setError(null)
    const usage = item._count.exercises + item._count.maxes

    const confirmed = window.confirm(
      usage > 0
        ? `«${item.name}» используется (записей в тренировках: ${item._count.exercises}, ` +
            `максимумов: ${item._count.maxes}). Упражнение будет архивировано: пропадёт из списка ` +
            `для новых тренировок, но существующие планы и максимумы останутся без изменений. ` +
            `Продолжить?`
        : `Удалить упражнение «${item.name}» из каталога?`
    )
    if (!confirmed) return

    setPendingId(item.id)
    try {
      const res = await fetch(`/api/admin/gym-exercises/${item.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось удалить упражнение'
        setError(message)
        toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
        return
      }
      if (body.archived) {
        setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, archivedAt: body.exercise.archivedAt } : x)))
        toast({ title: `«${item.name}» архивировано`, variant: 'success' })
      } else {
        setItems((prev) => prev.filter((x) => x.id !== item.id))
        toast({ title: `«${item.name}» удалено`, variant: 'success' })
      }
    } catch {
      const message = 'Проблема с сетью — упражнение не удалено'
      setError(message)
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  async function restoreExercise(item: GymExercise) {
    setError(null)
    setPendingId(item.id)
    try {
      const res = await fetch(`/api/admin/gym-exercises/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось восстановить упражнение'
        setError(message)
        toast({ title: 'Не удалось восстановить', description: message, variant: 'error' })
        return
      }
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, archivedAt: null } : x)))
      toast({ title: `«${item.name}» снова доступно`, variant: 'success' })
    } catch {
      const message = 'Проблема с сетью — упражнение не восстановлено'
      setError(message)
      toast({ title: 'Не удалось восстановить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Card className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Input placeholder="Название упражнения" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Категория" value={category} onChange={(e) => setCategory(e.target.value)} />
        <Button onClick={() => void add()}>Добавить</Button>
      </div>

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

      {query.trim() && filtered.length === 0 && (
        <p className="text-sm text-text-secondary">Ничего не найдено.</p>
      )}

      <div className="divide-y divide-border">
        {filtered.map((item) => (
          <div key={item.id} className={`py-2 text-sm ${item.archivedAt ? 'opacity-60' : ''}`}>
            {editingId === item.id ? (
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void saveEdit(item)}
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
                  <span>
                    {item.name}
                    {item.category && <span className="ml-2 text-text-secondary">{item.category}</span>}
                    {item.archivedAt && (
                      <Badge tone="neutral" className="ml-2">
                        Архивировано
                      </Badge>
                    )}
                  </span>
                  <p className="text-xs text-text-secondary">{item._count.exercises} в планах</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.archivedAt ? (
                    <button
                      type="button"
                      disabled={pendingId === item.id}
                      onClick={() => void restoreExercise(item)}
                      aria-label="Восстановить упражнение"
                      title="Восстановить упражнение"
                      className="text-text-secondary transition-colors hover:text-accent disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        aria-label="Редактировать упражнение"
                        title="Редактировать упражнение"
                        className="text-text-secondary transition-colors hover:text-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === item.id}
                        onClick={() => void deleteExercise(item)}
                        aria-label="Удалить упражнение"
                        title={
                          item._count.exercises + item._count.maxes > 0
                            ? 'Используется — будет архивировано, существующие планы не пострадают'
                            : 'Удалить упражнение'
                        }
                        className="text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
