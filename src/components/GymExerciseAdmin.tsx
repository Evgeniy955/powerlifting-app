'use client'

import { useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { Button, Card, Input, useToast } from '@/components/ui'

type GymExercise = {
  id: string
  name: string
  category: string | null
  _count: { exercises: number; maxes: number }
}

// Coach-only gym exercise catalog management — rename, retag category,
// delete unused rows. Mirrors AdminExercisesView (the powerlifting side's
// catalog), minus the training-group sorting that side has and this one
// doesn't need. Renaming needs no propagation step: GymExerciseEntry/
// GymClientMax only ever store the exerciseId and read name/category live
// off GymExerciseCatalog via the relation, so a save shows up immediately
// everywhere the exercise is used. Deleting a row that's actually in use is
// blocked by the API (409) unless the coach confirms a force delete, which
// also removes it from every workout it's logged in and every client's
// tracked max — same trade-off as the powerlifting side.
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
    let force = false

    if (usage > 0) {
      const confirmed = window.confirm(
        `«${item.name}» используется (записей в тренировках: ${item._count.exercises}, ` +
          `максимумов: ${item._count.maxes}). Удалить всё равно? Оно пропадёт и из истории ` +
          `тренировок, и из сохранённых максимумов — отменить это будет нельзя.`
      )
      if (!confirmed) return
      force = true
    } else if (!window.confirm(`Удалить упражнение «${item.name}» из каталога?`)) {
      return
    }

    setPendingId(item.id)
    try {
      const res = await fetch(`/api/admin/gym-exercises/${item.id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Не удалось удалить упражнение'
        setError(message)
        toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
        return
      }
      setItems((prev) => prev.filter((x) => x.id !== item.id))
      toast({ title: `«${item.name}» удалено`, variant: 'success' })
    } catch {
      const message = 'Проблема с сетью — упражнение не удалено'
      setError(message)
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
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

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.id} className="py-2 text-sm">
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
                  </span>
                  <p className="text-xs text-text-secondary">{item._count.exercises} в планах</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                        ? 'Используется — удаление сотрёт историю тренировок и максимумы'
                        : 'Удалить упражнение'
                    }
                    className="text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
