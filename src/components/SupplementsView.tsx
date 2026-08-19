'use client'

import { useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, Pencil, Pill, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, Input, useToast } from '@/components/ui'
import { EmptyState } from './EmptyState'

export type SupplementEntry = {
  id: string
  name: string
  startDate: string // ISO
  endDate: string | null // ISO | null (still taking it)
  notes: string | null
}

type Props = {
  athleteId: string
  initialSupplements: SupplementEntry[]
  // Both a coach and the athlete themselves can reach this page
  // (assertAthleteAccessible allows either), and either can manage entries —
  // same "owns" model as the rest of the app's shared athlete data.
  canManage: boolean
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// A date-input field with the browser's calendar glyph hidden (it overlaps
// the digits on narrow widths) and a matching icon button below instead —
// same pattern as CreatePlanDialog's start-date field.
function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  function open() {
    if (typeof ref.current?.showPicker === 'function') ref.current.showPicker()
    else ref.current?.focus()
  }
  return (
    <label className="block text-xs text-text-secondary">
      {label}
      <Input
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        fieldSize="sm"
        className="mt-1 w-full [&::-webkit-calendar-picker-indicator]:opacity-0"
      />
      <button
        type="button"
        onClick={open}
        className="mt-1 flex items-center gap-1 text-text-secondary transition-colors hover:text-accent"
      >
        <CalendarDays className="h-3.5 w-3.5" />
      </button>
    </label>
  )
}

// Спортпит: an athlete's supplement-intake log — name + start/end date,
// managed from this page (add/edit/delete). Purely informational, not tied
// into any training-load math elsewhere in the app.
export function SupplementsView({ athleteId, initialSupplements, canManage }: Props) {
  const toast = useToast()
  const [supplements, setSupplements] = useState(initialSupplements)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newStart, setNewStart] = useState(todayIso())
  const [newEnd, setNewEnd] = useState('')
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')

  const sorted = useMemo(
    () => [...supplements].sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [supplements]
  )

  function isActive(s: SupplementEntry) {
    if (!s.endDate) return true
    return s.endDate.slice(0, 10) >= todayIso()
  }

  async function createSupplement() {
    setError(null)
    const name = newName.trim()
    if (!name) {
      setError('Название обязательно')
      return
    }
    if (!newStart) {
      setError('Дата начала обязательна')
      return
    }
    setCreating(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/supplements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate: newStart, endDate: newEnd || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось добавить'
        setError(message)
        toast({ title: 'Не удалось добавить', description: message, variant: 'error' })
        return
      }
      setSupplements((prev) => [...prev, body])
      toast({ title: `«${body.name}» добавлено`, variant: 'success' })
      setNewName('')
      setNewStart(todayIso())
      setNewEnd('')
      setShowCreate(false)
    } catch (e) {
      console.error('createSupplement failed', e)
      const message = 'Проблема с сетью — запись не добавлена'
      setError(message)
      toast({ title: 'Не удалось добавить', description: message, variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  function startEdit(s: SupplementEntry) {
    setError(null)
    setEditingId(s.id)
    setDraftName(s.name)
    setDraftStart(toDateInput(s.startDate))
    setDraftEnd(toDateInput(s.endDate))
  }

  async function saveEdit(s: SupplementEntry) {
    setError(null)
    setPendingId(s.id)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/supplements/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftName,
          startDate: draftStart,
          endDate: draftEnd || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось сохранить изменения'
        setError(message)
        toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
        return
      }
      setSupplements((prev) => prev.map((x) => (x.id === s.id ? body : x)))
      setEditingId(null)
      toast({ title: 'Сохранено', variant: 'success' })
    } catch (e) {
      console.error('saveEdit failed', e)
      const message = 'Проблема с сетью — изменения не сохранены'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  async function deleteSupplement(s: SupplementEntry) {
    if (!window.confirm(`Удалить «${s.name}» из списка?`)) return
    setError(null)
    setPendingId(s.id)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/supplements/${s.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Не удалось удалить'
        setError(message)
        toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
        return
      }
      setSupplements((prev) => prev.filter((x) => x.id !== s.id))
      toast({ title: `«${s.name}» удалено`, variant: 'success' })
    } catch (e) {
      console.error('deleteSupplement failed', e)
      const message = 'Проблема с сетью — запись не удалена'
      setError(message)
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {canManage &&
        (showCreate ? (
          <Card padding="sm" className="space-y-2">
            <p className="font-display text-sm font-bold uppercase tracking-wide">Новая запись</p>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название (напр. «Креатин»)"
              fieldSize="sm"
              className="w-full"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <DateField label="Начало приёма" value={newStart} onChange={setNewStart} />
              <DateField label="Окончание (если знаешь)" value={newEnd} onChange={setNewEnd} />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" disabled={creating} onClick={createSupplement}>
                <Check className="h-3.5 w-3.5" /> Добавить
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreate(false)
                  setError(null)
                  setNewName('')
                  setNewStart(todayIso())
                  setNewEnd('')
                }}
              >
                <X className="h-3.5 w-3.5" /> Отмена
              </Button>
            </div>
          </Card>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Добавить спортпит
          </Button>
        ))}

      {error && !showCreate && <p className="text-sm text-danger">{error}</p>}

      {sorted.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="Пока пусто"
          description="Добавь спортивное питание, которое принимаешь, с датой начала и окончания приёма."
        />
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {sorted.map((s) => (
            <li key={s.id}>
              <Card padding="sm" className="space-y-2">
                {editingId === s.id ? (
                  <div className="space-y-2">
                    <Input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Название"
                      fieldSize="sm"
                      className="w-full"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <DateField label="Начало" value={draftStart} onChange={setDraftStart} />
                      <DateField label="Окончание" value={draftEnd} onChange={setDraftEnd} />
                    </div>
                    {error && <p className="text-xs text-danger">{error}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pendingId === s.id}
                        onClick={() => saveEdit(s)}
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {formatDate(s.startDate)} — {s.endDate ? formatDate(s.endDate) : 'сейчас'}
                      </p>
                      <div className="mt-1.5">
                        {isActive(s) ? (
                          <Badge tone="low">Принимает</Badge>
                        ) : (
                          <Badge tone="neutral">Завершён</Badge>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          aria-label="Редактировать"
                          title="Редактировать"
                          className="text-text-secondary transition-colors hover:text-accent"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pendingId === s.id}
                          onClick={() => deleteSupplement(s)}
                          aria-label="Удалить"
                          title="Удалить"
                          className="text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
