'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Unlink, X } from 'lucide-react'
import { Button, Card, Dialog, Input, Select, useToast } from '@/components/ui'
import { CreatePlanDialog } from '@/components/CreatePlanDialog'
import { PERIOD_PRESETS, STAGE_PRESETS, MESOCYCLE_PRESETS, MICROCYCLE_PRESETS, periodColor } from '@/lib/periodization'

type StageOption = { id: string; name: string; startDate: string; endDate: string }
type PeriodOption = { id: string; name: string; startDate: string; endDate: string; stages: StageOption[] }

type MesocycleColumn = {
  id: string
  name: string
  startDate: string
  weeks: number
  mesocycleType: string | null
  stageId: string | null
  periodId: string | null
  microcycles: { id: string; weekNumber: number; microcycleType: string | null }[]
}

type Props = {
  athleteId: string
  periods: PeriodOption[]
  columns: MesocycleColumn[]
  canEdit: boolean
}

const NEW_PERIOD = '__new_period__'
const NEW_STAGE = '__new_stage__'
const DAY_MS = 24 * 60 * 60 * 1000

function fmt(iso: string) {
  return iso.slice(0, 10)
}
function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}
function weeksBetween(startIso: string, endIso: string) {
  return Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / (7 * DAY_MS)))
}

type Pending = { periodId: string; stageId: string }

// Spreadsheet-style table, one column per mesocycle (Cycle/training plan),
// four fixed rows underneath: Период / Этап / Мезоцикл / Микроцикл. Each
// column cascades independently — pick a Период, which reveals the Этап
// dropdown scoped to it (options = that период's stages), which reveals the
// Мезоцикл slot (attach by picking Этап, which patches Cycle.stageId
// directly — no separate "attach" step), whose Микроциклы (weeks) list
// underneath. "+" inside the Период/Этап dropdowns creates a new one without
// leaving the table; a ghost column at the end starts a brand-new mesocycle
// (a real CreatePlanDialog, since a mesocycle here always means a full
// trainable plan, same as everywhere else in the app).
export function PeriodizationView({ athleteId, periods, columns, canEdit }: Props) {
  const router = useRouter()

  const [pendingMap, setPendingMap] = useState<Record<string, Pending>>({})
  const [showDraft, setShowDraft] = useState(false)
  const [periodDialog, setPeriodDialog] = useState<{ forKey: string | null } | null>(null)
  const [stageDialog, setStageDialog] = useState<{ forKey: string; periodId: string } | null>(null)

  const toast = useToast()

  function keyFor(column: MesocycleColumn | null) {
    return column ? column.id : 'draft'
  }

  function getPending(key: string, column: MesocycleColumn | null): Pending {
    return pendingMap[key] ?? { periodId: column?.periodId ?? '', stageId: column?.stageId ?? '' }
  }

  function setPending(key: string, column: MesocycleColumn | null, patch: Partial<Pending>) {
    setPendingMap((prev) => ({ ...prev, [key]: { ...getPending(key, column), ...patch } }))
  }

  function clearPending(key: string) {
    setPendingMap((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  async function mutate(url: string, method: string, body?: unknown, successTitle?: string) {
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Не удалось сохранить')
      }
      router.refresh()
      if (successTitle) toast({ title: successTitle, variant: 'success' })
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
      return false
    }
  }

  function handlePeriodChange(key: string, column: MesocycleColumn | null, value: string) {
    if (value === NEW_PERIOD) {
      setPeriodDialog({ forKey: key })
      return
    }
    setPending(key, column, { periodId: value, stageId: '' })
  }

  async function handleStageChange(key: string, column: MesocycleColumn | null, periodId: string, value: string) {
    if (value === NEW_STAGE) {
      setStageDialog({ forKey: key, periodId })
      return
    }
    setPending(key, column, { stageId: value })
    if (column) {
      const ok = await mutate(`/api/cycles/${column.id}`, 'PATCH', { stageId: value || null }, 'Этап обновлён')
      if (ok) clearPending(key)
    }
  }

  async function handleDetach(column: MesocycleColumn) {
    const ok = await mutate(`/api/cycles/${column.id}`, 'PATCH', { stageId: null }, 'План откреплён')
    if (ok) clearPending(column.id)
  }

  async function handleAddWeek(column: MesocycleColumn) {
    await mutate(`/api/cycles/${column.id}/microcycles`, 'POST', undefined, 'Неделя добавлена')
  }

  const allColumns: (MesocycleColumn | null)[] = [...columns, ...(showDraft ? [null] : [])]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {periods.map((period) => (
            <PeriodPill key={period.id} period={period} canEdit={canEdit} onEdited={() => router.refresh()} />
          ))}
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setPeriodDialog({ forKey: null })}>
            <Plus className="h-4 w-4" /> Добавить период
          </Button>
        )}
      </div>

      {periods.length === 0 ? (
        <Card padding="md" className="text-center text-sm text-text-secondary">
          Периодов пока нет. Добавь первый — он задаёт длительность макроцикла (от 12 недель до года); внутри него
          дальше добавляются этапы и мезоциклы.
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <tbody>
                <tr className="border-b border-border">
                  <RowLabel>Период</RowLabel>
                  {allColumns.map((column) => {
                    const key = keyFor(column)
                    const pending = getPending(key, column)
                    return (
                      <td key={key} className="min-w-[220px] border-l border-border p-2 align-top">
                        {canEdit ? (
                          <Select
                            fieldSize="sm"
                            className="w-full"
                            value={pending.periodId}
                            onChange={(e) => handlePeriodChange(key, column, e.target.value)}
                          >
                            <option value="">не выбран</option>
                            {periods.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                            <option value={NEW_PERIOD}>+ Добавить период</option>
                          </Select>
                        ) : (
                          <span className="text-xs">{periods.find((p) => p.id === pending.periodId)?.name ?? '—'}</span>
                        )}
                      </td>
                    )
                  })}
                  {canEdit && <AddColumnCell showDraft={showDraft} onToggle={() => {
                    setShowDraft((v) => !v)
                    clearPending('draft')
                  }} />}
                </tr>

                <tr className="border-b border-border">
                  <RowLabel>Этап</RowLabel>
                  {allColumns.map((column) => {
                    const key = keyFor(column)
                    const pending = getPending(key, column)
                    const period = periods.find((p) => p.id === pending.periodId)
                    return (
                      <td key={key} className="border-l border-border p-2 align-top">
                        {canEdit ? (
                          <Select
                            fieldSize="sm"
                            className="w-full"
                            value={pending.stageId}
                            disabled={!period}
                            onChange={(e) => handleStageChange(key, column, pending.periodId, e.target.value)}
                          >
                            <option value="">{period ? 'не выбран' : 'сначала период'}</option>
                            {period?.stages.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                            {period && <option value={NEW_STAGE}>+ Добавить этап</option>}
                          </Select>
                        ) : (
                          <span className="text-xs">
                            {period?.stages.find((s) => s.id === pending.stageId)?.name ?? '—'}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-border">
                  <RowLabel>Мезоцикл</RowLabel>
                  {allColumns.map((column) => {
                    const key = keyFor(column)
                    const pending = getPending(key, column)
                    return (
                      <td key={key} className="border-l border-border p-2 align-top">
                        {column ? (
                          <div className="space-y-1.5">
                            <Link href={`/cycles/${column.id}`} className="text-sm font-medium hover:text-accent">
                              {column.name}
                            </Link>
                            <p className="text-xs text-text-secondary">
                              {fmt(column.startDate)} · {column.weeks} нед.
                            </p>
                            {canEdit && (
                              <div className="flex items-center gap-1.5">
                                <Select
                                  fieldSize="sm"
                                  className="flex-1"
                                  value={column.mesocycleType ?? ''}
                                  onChange={(e) =>
                                    mutate(`/api/cycles/${column.id}`, 'PATCH', {
                                      mesocycleType: e.target.value || null,
                                    })
                                  }
                                >
                                  <option value="">не указан</option>
                                  {MESOCYCLE_PRESETS.map((p) => (
                                    <option key={p} value={p}>
                                      {p}
                                    </option>
                                  ))}
                                </Select>
                                <button
                                  onClick={() => handleDetach(column)}
                                  className="rounded p-1 text-text-secondary hover:bg-surface-2 hover:text-danger"
                                  title="Открепить от этапа"
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : canEdit ? (
                          <CreatePlanDialog
                            athleteId={athleteId}
                            stageId={pending.stageId || undefined}
                            trigger={(open) => (
                              <Button variant="outline" size="sm" disabled={!pending.stageId} onClick={open}>
                                <Plus className="h-4 w-4" /> Новый план
                              </Button>
                            )}
                            onCreated={() => {
                              setShowDraft(false)
                              clearPending('draft')
                              router.refresh()
                            }}
                          />
                        ) : null}
                      </td>
                    )
                  })}
                </tr>

                <tr>
                  <RowLabel>Микроцикл</RowLabel>
                  {allColumns.map((column) => {
                    const key = keyFor(column)
                    return (
                      <td key={key} className="border-l border-border p-2 align-top">
                        {column ? (
                          <div className="flex flex-wrap gap-1">
                            {column.microcycles.map((mc) => (
                              <div
                                key={mc.id}
                                className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-1 text-xs"
                              >
                                <span className="text-text-secondary">Нед {mc.weekNumber}</span>
                                {canEdit ? (
                                  <select
                                    value={mc.microcycleType ?? ''}
                                    onChange={(e) =>
                                      mutate(`/api/microcycles/${mc.id}`, 'PATCH', {
                                        microcycleType: e.target.value || null,
                                      })
                                    }
                                    className="rounded border-none bg-transparent text-xs outline-none"
                                  >
                                    <option value="">—</option>
                                    {MICROCYCLE_PRESETS.map((p) => (
                                      <option key={p} value={p}>
                                        {p}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span>{mc.microcycleType ?? '—'}</span>
                                )}
                              </div>
                            ))}
                            {canEdit && (
                              <button
                                onClick={() => handleAddWeek(column)}
                                className="flex items-center gap-0.5 rounded-md border border-dashed border-border px-1.5 py-1 text-xs text-text-secondary hover:border-accent hover:text-accent"
                              >
                                <Plus className="h-3 w-3" /> Неделя
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-text-secondary">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PeriodFormDialog
        open={periodDialog !== null}
        onOpenChange={(open) => !open && setPeriodDialog(null)}
        athleteId={athleteId}
        onSaved={(period) => {
          if (periodDialog?.forKey) setPending(periodDialog.forKey, null, { periodId: period.id, stageId: '' })
          setPeriodDialog(null)
          router.refresh()
        }}
      />
      <StageFormDialog
        open={stageDialog !== null}
        onOpenChange={(open) => !open && setStageDialog(null)}
        periodId={stageDialog?.periodId ?? ''}
        onSaved={(stage) => {
          const forKey = stageDialog?.forKey
          if (forKey) {
            setPending(forKey, null, { stageId: stage.id })
            const column = columns.find((c) => c.id === forKey)
            if (column) {
              mutate(`/api/cycles/${column.id}`, 'PATCH', { stageId: stage.id }, 'Этап обновлён').then((ok) => {
                if (ok) clearPending(forKey)
              })
            }
          }
          setStageDialog(null)
          router.refresh()
        }}
      />
    </div>
  )
}

function RowLabel({ children }: { children: string }) {
  return (
    <td className="sticky left-0 z-10 w-28 shrink-0 whitespace-nowrap bg-surface-2 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </td>
  )
}

function AddColumnCell({ showDraft, onToggle }: { showDraft: boolean; onToggle: () => void }) {
  return (
    <td rowSpan={4} className="border-l border-border p-2 align-middle">
      <button
        onClick={onToggle}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border text-text-secondary transition-colors hover:border-accent hover:text-accent"
        title={showDraft ? 'Отменить добавление мезоцикла' : 'Добавить мезоцикл'}
      >
        {showDraft ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </td>
  )
}

function PeriodPill({
  period,
  canEdit,
  onEdited,
}: {
  period: PeriodOption
  canEdit: boolean
  onEdited: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const color = periodColor(period.name)

  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${color.bg} ${color.text}`}>
      <span>{period.name}</span>
      <span className="opacity-70">
        {fmt(period.startDate)} – {fmt(period.endDate)}
      </span>
      {canEdit && (
        <button onClick={() => setEditOpen(true)} className="rounded p-0.5 hover:bg-black/10" aria-label="Редактировать период">
          <Pencil className="h-3 w-3" />
        </button>
      )}
      <PeriodFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        period={period}
        onSaved={() => {
          setEditOpen(false)
          onEdited()
        }}
      />
    </div>
  )
}

function PeriodFormDialog({
  open,
  onOpenChange,
  athleteId,
  period,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  athleteId?: string
  period?: { id: string; name: string; startDate: string; endDate: string }
  onSaved: (period: { id: string; name: string; startDate: string; endDate: string }) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(period?.name ?? PERIOD_PRESETS[0])
  const [startDate, setStartDate] = useState(period ? fmt(period.startDate) : todayIso())
  const [durationWeeks, setDurationWeeks] = useState(period ? weeksBetween(period.startDate, period.endDate) : 12)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(period?.name ?? PERIOD_PRESETS[0])
    setStartDate(period ? fmt(period.startDate) : todayIso())
    setDurationWeeks(period ? weeksBetween(period.startDate, period.endDate) : 12)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSave() {
    if (!startDate) {
      setError('Укажите дату начала')
      return
    }
    if (durationWeeks < 12 || durationWeeks > 52) {
      setError('Длительность: от 12 до 52 недель')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const endDate = addDays(startDate, durationWeeks * 7)
      const url = period ? `/api/periods/${period.id}` : `/api/athletes/${athleteId}/periods`
      const res = await fetch(url, {
        method: period ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить')
      }
      const saved = await res.json()
      toast({ title: period ? 'Период обновлён' : 'Период добавлен', variant: 'success' })
      onSaved(saved)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={period ? 'Редактировать период' : 'Новый период'}>
      <div className="space-y-3">
        <label className="block text-xs text-text-secondary">
          Название
          <Select value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full">
            {PERIOD_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <label className="block flex-1 text-xs text-text-secondary">
            Начало
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full"
            />
          </label>
          <label className="block flex-1 text-xs text-text-secondary">
            Длительность (недель)
            <Input
              type="number"
              min={12}
              max={52}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <p className="text-xs text-text-secondary">Окончание: {addDays(startDate || todayIso(), durationWeeks * 7)}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading}>
            {loading ? 'Сохраняю...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function StageFormDialog({
  open,
  onOpenChange,
  periodId,
  stage,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  periodId: string
  stage?: { id: string; name: string; startDate: string; endDate: string }
  onSaved: (stage: { id: string; name: string; startDate: string; endDate: string }) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(stage?.name ?? STAGE_PRESETS[0])
  const [startDate, setStartDate] = useState(stage ? fmt(stage.startDate) : todayIso())
  const [endDate, setEndDate] = useState(stage ? fmt(stage.endDate) : todayIso())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(stage?.name ?? STAGE_PRESETS[0])
    setStartDate(stage ? fmt(stage.startDate) : todayIso())
    setEndDate(stage ? fmt(stage.endDate) : todayIso())
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSave() {
    if (!startDate || !endDate) {
      setError('Укажите обе даты')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const url = stage ? `/api/stages/${stage.id}` : `/api/periods/${periodId}/stages`
      const res = await fetch(url, {
        method: stage ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, endDate }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить')
      }
      const saved = await res.json()
      toast({ title: stage ? 'Этап обновлён' : 'Этап добавлен', variant: 'success' })
      onSaved(saved)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={stage ? 'Редактировать этап' : 'Новый этап'}>
      <div className="space-y-3">
        <label className="block text-xs text-text-secondary">
          Название
          <Select value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full">
            {STAGE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <label className="block flex-1 text-xs text-text-secondary">
            Начало
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full"
            />
          </label>
          <label className="block flex-1 text-xs text-text-secondary">
            Конец
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full" />
          </label>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button size="sm" onClick={handleSave} disabled={loading}>
            {loading ? 'Сохраняю...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
