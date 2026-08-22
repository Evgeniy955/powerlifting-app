'use client'

import { useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, Pencil, Plus, Trash2, Trophy, X } from 'lucide-react'
import { Badge, Button, Card, Input, useToast } from '@/components/ui'
import { EmptyState } from './EmptyState'

export type CompetitionEntry = {
  id: string
  name: string
  date: string // ISO
  weightClass: string | null
  bodyweight: number | null
  squat: number | null
  bench: number | null
  deadlift: number | null
  place: number | null
  notes: string | null
}

type Props = {
  athleteId: string
  initialCompetitions: CompetitionEntry[]
  // Both a coach and the athlete themselves can reach this page
  // (assertAthleteAccessible allows either), and either can manage entries —
  // same "owns" model as Спортпит and the rest of the app's shared athlete
  // data.
  canManage: boolean
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function toDateInput(iso: string) {
  return iso.slice(0, 10)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// number <-> string round-trip for controlled number inputs — empty string
// means "not set" (null), same convention the API's PATCH body already uses
// to distinguish "leave unchanged" (omitted) from "clear" (null) from "set"
// (a number).
function toNumberOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function fromNumberOrNull(v: number | null): string {
  return v === null ? '' : String(v)
}

// Same hidden-native-glyph date field as SupplementsView's DateField —
// duplicated locally rather than shared, same as that component does,
// since it's a small, page-local building block.
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

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block text-xs text-text-secondary">
      {label}
      <Input
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        fieldSize="sm"
        className="mt-1 w-full"
      />
    </label>
  )
}

function total(c: { squat: number | null; bench: number | null; deadlift: number | null }) {
  return c.squat !== null && c.bench !== null && c.deadlift !== null
    ? c.squat + c.bench + c.deadlift
    : null
}

type Draft = {
  name: string
  date: string
  weightClass: string
  bodyweight: string
  squat: string
  bench: string
  deadlift: string
  place: string
  notes: string
}

const EMPTY_DRAFT: Draft = {
  name: '',
  date: todayIso(),
  weightClass: '',
  bodyweight: '',
  squat: '',
  bench: '',
  deadlift: '',
  place: '',
  notes: '',
}

function draftFromEntry(c: CompetitionEntry): Draft {
  return {
    name: c.name,
    date: toDateInput(c.date),
    weightClass: c.weightClass ?? '',
    bodyweight: fromNumberOrNull(c.bodyweight),
    squat: fromNumberOrNull(c.squat),
    bench: fromNumberOrNull(c.bench),
    deadlift: fromNumberOrNull(c.deadlift),
    place: c.place === null ? '' : String(c.place),
    notes: c.notes ?? '',
  }
}

function DraftFields({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  return (
    <div className="space-y-2">
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Название (напр. «Чемпионат города»)"
        fieldSize="sm"
        className="w-full"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <DateField label="Дата" value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
        <label className="block text-xs text-text-secondary">
          Весовая категория
          <Input
            value={draft.weightClass}
            onChange={(e) => setDraft({ ...draft, weightClass: e.target.value })}
            placeholder="напр. 83 кг"
            fieldSize="sm"
            className="mt-1 w-full"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Вес спортсмена, кг"
          value={draft.bodyweight}
          onChange={(v) => setDraft({ ...draft, bodyweight: v })}
        />
        <label className="block text-xs text-text-secondary">
          Место
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min={1}
            value={draft.place}
            onChange={(e) => setDraft({ ...draft, place: e.target.value })}
            fieldSize="sm"
            className="mt-1 w-full"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Присед, кг"
          value={draft.squat}
          onChange={(v) => setDraft({ ...draft, squat: v })}
        />
        <NumberField
          label="Жим, кг"
          value={draft.bench}
          onChange={(v) => setDraft({ ...draft, bench: v })}
        />
        <NumberField
          label="Тяга, кг"
          value={draft.deadlift}
          onChange={(v) => setDraft({ ...draft, deadlift: v })}
        />
      </div>
      <Input
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Заметки (необязательно)"
        fieldSize="sm"
        className="w-full"
      />
    </div>
  )
}

function draftToBody(draft: Draft) {
  return {
    name: draft.name,
    date: draft.date,
    weightClass: draft.weightClass || null,
    bodyweight: toNumberOrNull(draft.bodyweight),
    squat: toNumberOrNull(draft.squat),
    bench: toNumberOrNull(draft.bench),
    deadlift: toNumberOrNull(draft.deadlift),
    place: draft.place.trim() === '' ? null : Math.trunc(Number(draft.place)),
    notes: draft.notes || null,
  }
}

// Соревнования: an athlete's competition results log — name, date, weight
// class, weigh-in bodyweight, and squat/bench/deadlift (each independently
// optional — a no-lift shouldn't block recording the other two). Total is
// computed here from the three lifts, never stored, so it can't drift out of
// sync — same approach as the Мои спортсмены main-lifts widget.
export function CompetitionsView({ athleteId, initialCompetitions, canManage }: Props) {
  const toast = useToast()
  const [competitions, setCompetitions] = useState(initialCompetitions)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_DRAFT)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT)

  const sorted = useMemo(
    () => [...competitions].sort((a, b) => b.date.localeCompare(a.date)),
    [competitions]
  )

  async function createCompetition() {
    setError(null)
    if (!newDraft.name.trim()) {
      setError('Название обязательно')
      return
    }
    if (!newDraft.date) {
      setError('Дата обязательна')
      return
    }
    setCreating(true)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/competitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBody(newDraft)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось добавить'
        setError(message)
        toast({ title: 'Не удалось добавить', description: message, variant: 'error' })
        return
      }
      setCompetitions((prev) => [...prev, body])
      toast({ title: `«${body.name}» добавлено`, variant: 'success' })
      setNewDraft(EMPTY_DRAFT)
      setShowCreate(false)
    } catch (e) {
      console.error('createCompetition failed', e)
      const message = 'Проблема с сетью — запись не добавлена'
      setError(message)
      toast({ title: 'Не удалось добавить', description: message, variant: 'error' })
    } finally {
      setCreating(false)
    }
  }

  function startEdit(c: CompetitionEntry) {
    setError(null)
    setEditingId(c.id)
    setEditDraft(draftFromEntry(c))
  }

  async function saveEdit(c: CompetitionEntry) {
    setError(null)
    setPendingId(c.id)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/competitions/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToBody(editDraft)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Не удалось сохранить изменения'
        setError(message)
        toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
        return
      }
      setCompetitions((prev) => prev.map((x) => (x.id === c.id ? body : x)))
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

  async function deleteCompetition(c: CompetitionEntry) {
    if (!window.confirm(`Удалить «${c.name}» из списка?`)) return
    setError(null)
    setPendingId(c.id)
    try {
      const res = await fetch(`/api/athletes/${athleteId}/competitions/${c.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Не удалось удалить'
        setError(message)
        toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
        return
      }
      setCompetitions((prev) => prev.filter((x) => x.id !== c.id))
      toast({ title: `«${c.name}» удалено`, variant: 'success' })
    } catch (e) {
      console.error('deleteCompetition failed', e)
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
            <p className="font-display text-sm font-bold uppercase tracking-wide">Новое соревнование</p>
            <DraftFields draft={newDraft} setDraft={setNewDraft} />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" disabled={creating} onClick={createCompetition}>
                <Check className="h-3.5 w-3.5" /> Добавить
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreate(false)
                  setError(null)
                  setNewDraft(EMPTY_DRAFT)
                }}
              >
                <X className="h-3.5 w-3.5" /> Отмена
              </Button>
            </div>
          </Card>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> Добавить соревнование
          </Button>
        ))}

      {error && !showCreate && <p className="text-sm text-danger">{error}</p>}

      {sorted.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Пока пусто"
          description="Добавь результаты выступлений — весовую категорию, собственный вес и результаты в приседе, жиме и тяге."
        />
      ) : (
        <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 xl:grid-cols-3">
          {sorted.map((c) => (
            <li key={c.id}>
              <Card padding="sm" className="space-y-2">
                {editingId === c.id ? (
                  <div className="space-y-2">
                    <DraftFields draft={editDraft} setDraft={setEditDraft} />
                    {error && <p className="text-xs text-danger">{error}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={pendingId === c.id}
                        onClick={() => saveEdit(c)}
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
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="mt-0.5 text-xs text-text-secondary">
                          {formatDate(c.date)}
                          {c.weightClass && ` · ${c.weightClass}`}
                          {c.bodyweight !== null && ` · ${c.bodyweight} кг`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {c.place !== null && <Badge tone={c.place === 1 ? 'low' : 'neutral'}>{c.place} место</Badge>}
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              aria-label="Редактировать"
                              title="Редактировать"
                              className="text-text-secondary transition-colors hover:text-accent"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={pendingId === c.id}
                              onClick={() => deleteCompetition(c)}
                              aria-label="Удалить"
                              title="Удалить"
                              className="text-text-secondary transition-colors hover:text-danger disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {(c.squat !== null || c.bench !== null || c.deadlift !== null) && (
                      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
                        <span className="text-text-secondary">Присед</span>
                        <span className="font-display tracking-wide">
                          {c.squat ?? '—'} {c.squat !== null && 'кг'}
                        </span>
                        <span className="text-text-secondary">Жим</span>
                        <span className="font-display tracking-wide">
                          {c.bench ?? '—'} {c.bench !== null && 'кг'}
                        </span>
                        <span className="text-text-secondary">Тяга</span>
                        <span className="font-display tracking-wide">
                          {c.deadlift ?? '—'} {c.deadlift !== null && 'кг'}
                        </span>
                        <span className="text-text-secondary font-medium">Сумма</span>
                        <span className="font-display font-bold tracking-wide text-accent">
                          {total(c) ?? '—'} {total(c) !== null && 'кг'}
                        </span>
                      </div>
                    )}

                    {c.notes && <p className="text-xs text-text-secondary">{c.notes}</p>}
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
