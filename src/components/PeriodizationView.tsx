'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Dialog, Input, Select, useToast } from '@/components/ui'
import { PERIOD_PRESETS, STAGE_PRESETS, MESOCYCLE_PRESETS, MICROCYCLE_PRESETS, periodColor, stageColor } from '@/lib/periodization'

type StageOption = { id: string; name: string; startDate: string; endDate: string }
type PeriodOption = { id: string; name: string; startDate: string; endDate: string; stages: StageOption[] }

// A Мезоцикл is a standalone entity scoped to exactly one Stage (stageId is
// required, unlike the old Cycle-based version which could be unattached) —
// see the Mesocycle model's comment in schema.prisma. No separate "type" tag:
// `name` (picked from MESOCYCLE_PRESETS) doubles as the label shown in the
// table, same simplification the coach asked for (name + duration only).
type MesocycleColumn = {
  id: string
  name: string
  startDate: string
  weeks: number
  stageId: string
  periodId: string
  microcycles: { id: string; weekNumber: number; microcycleType: string | null }[]
}

type Props = {
  athleteId: string
  periods: PeriodOption[]
  columns: MesocycleColumn[]
  canEdit: boolean
}

const NEW_STAGE = '__new_stage__'
const DAY_MS = 24 * 60 * 60 * 1000

function fmt(iso: string) {
  return iso.slice(0, 10)
}
function fmtShort(iso: string) {
  return iso.slice(0, 10).split('-').reverse().join('.')
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

// One week (PeriodizationMicrocycle) flattened out of a Mesocycle, annotated
// with the period/stage it belongs to — the unit a real table column represents.
type WeekColumn = {
  microcycleId: string
  microcycleType: string | null
  weekStart: string
  mesocycleId: string
  mesocycleName: string
  stageId: string
  periodId: string
}

// A table column is either a real week, or — for a period that has no
// mesocycles attached yet — a single placeholder column standing in for
// that whole (still-empty) period, so every period always has a home
// inside the table itself rather than needing a separate list above it.
type ColumnEntry =
  | { kind: 'week'; sortKey: string; week: WeekColumn }
  | { kind: 'empty-period'; sortKey: string; period: PeriodOption }

type Span = { key: string; start: number; span: number }

function groupConsecutive(items: ColumnEntry[], keyFn: (item: ColumnEntry) => string): Span[] {
  const spans: Span[] = []
  items.forEach((item, i) => {
    const key = keyFn(item)
    const last = spans[spans.length - 1]
    if (last && last.key === key) last.span += 1
    else spans.push({ key, start: i, span: 1 })
  })
  return spans
}

// Spreadsheet-style merged-cell timeline — one narrow column per week
// (PeriodizationMicrocycle) plus one placeholder column per still-empty
// period, four fixed rows underneath: Периоды / Этап / Мезоциклы /
// Микроциклы, matching the original planning sheet. Периоды/Этап/Мезоциклы
// render as merged cells (colSpan) spanning the weeks that belong to them;
// Микроциклы stays one cell per week. Periods live entirely inside the
// table: every Период cell carries its own edit (✎) and add (+) controls,
// and a trailing ghost column at the far right adds a brand-new period.
// Adding "onto" a period walks pick-or-create Этап -> create Мезоцикл (a
// standalone name+duration entity, deliberately NOT a real training plan —
// see schema.prisma); the resulting weeks appear as new merged columns
// after refresh. Clicking an existing Мезоцикл block reopens the editor to
// rename it, move it to another этап, add a week, or delete it.
export function PeriodizationView({ athleteId, periods, columns, canEdit }: Props) {
  const router = useRouter()
  const toast = useToast()

  const [addToPeriod, setAddToPeriod] = useState<PeriodOption | null>(null)
  const [editingMesocycle, setEditingMesocycle] = useState<MesocycleColumn | null>(null)
  const [editingPeriod, setEditingPeriod] = useState<PeriodOption | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<PeriodOption | null>(null)
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)

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

  const mainColumns = useMemo<ColumnEntry[]>(() => {
    const entries: ColumnEntry[] = []
    const periodsWithWeeks = new Set<string>()

    for (const mesocycle of columns) {
      periodsWithWeeks.add(mesocycle.periodId)
      for (const mc of mesocycle.microcycles) {
        const weekStart = addDays(mesocycle.startDate, (mc.weekNumber - 1) * 7)
        entries.push({
          kind: 'week',
          sortKey: weekStart,
          week: {
            microcycleId: mc.id,
            microcycleType: mc.microcycleType,
            weekStart,
            mesocycleId: mesocycle.id,
            mesocycleName: mesocycle.name,
            stageId: mesocycle.stageId,
            periodId: mesocycle.periodId,
          },
        })
      }
    }

    for (const period of periods) {
      if (!periodsWithWeeks.has(period.id)) {
        entries.push({ kind: 'empty-period', sortKey: period.startDate, period })
      }
    }

    entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    return entries
  }, [columns, periods])

  const periodSpans = useMemo(
    () => groupConsecutive(mainColumns, (e) => (e.kind === 'week' ? e.week.periodId : e.period.id)),
    [mainColumns]
  )
  const stageSpans = useMemo(
    () => groupConsecutive(mainColumns, (e) => (e.kind === 'week' ? e.week.stageId : `empty-${e.period.id}`)),
    [mainColumns]
  )
  const mesocycleSpans = useMemo(
    () => groupConsecutive(mainColumns, (e) => (e.kind === 'week' ? e.week.mesocycleId : `empty-${e.period.id}`)),
    [mainColumns]
  )

  function periodOf(id: string) {
    return periods.find((p) => p.id === id)
  }

  return (
    <div className="space-y-4">
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <RowLabel />
                {mainColumns.map((c) => (
                  <th
                    key={c.kind === 'week' ? c.week.microcycleId : `empty-${c.period.id}`}
                    className="min-w-[92px] border-l border-border bg-surface-2 px-1.5 py-1.5 text-center text-[11px] font-normal text-text-secondary"
                  >
                    {c.kind === 'week' ? fmtShort(c.week.weekStart) : ''}
                  </th>
                ))}
                {canEdit && <th className="w-12 border-l border-border bg-surface-2" />}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <RowLabel>Периоды</RowLabel>
                {periodSpans.map((span) => {
                  const entry = mainColumns[span.start]
                  const period = entry.kind === 'week' ? periodOf(entry.week.periodId) : entry.period
                  const color = periodColor(period?.name)
                  return (
                    <td
                      key={span.start}
                      colSpan={span.span}
                      className={`border-l border-border px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${color.bg} ${color.text}`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className="truncate">{period?.name ?? '—'}</span>
                        {canEdit && period && (
                          <>
                            <button
                              onClick={() => setEditingPeriod(period)}
                              className="shrink-0 rounded p-0.5 hover:bg-black/10"
                              aria-label="Редактировать период"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setAddToPeriod(period)}
                              className="shrink-0 rounded p-0.5 hover:bg-black/10"
                              title="Добавить этап/мезоцикл в этот период"
                              aria-label="Добавить в период"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletingPeriod(period)}
                              className="shrink-0 rounded p-0.5 hover:bg-black/10"
                              title="Удалить период"
                              aria-label="Удалить период"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                      <div className="mt-0.5 text-[10px] font-normal normal-case opacity-80">
                        {period ? `${fmt(period.startDate)} – ${fmt(period.endDate)}` : ''}
                      </div>
                    </td>
                  )
                })}
                {canEdit && (
                  <td rowSpan={4} className="border-l border-border p-2 align-middle">
                    <button
                      onClick={() => setPeriodDialogOpen(true)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-border text-text-secondary transition-colors hover:border-accent hover:text-accent"
                      title="Добавить период"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>

              <tr className="border-b border-border">
                <RowLabel>Этап</RowLabel>
                {stageSpans.map((span) => {
                  const entry = mainColumns[span.start]
                  if (entry.kind === 'empty-period') {
                    return (
                      <td key={span.start} colSpan={span.span} className="border-l border-border px-2 py-2 text-center text-xs text-text-secondary">
                        —
                      </td>
                    )
                  }
                  const period = periodOf(entry.week.periodId)
                  const stage = period?.stages.find((s) => s.id === entry.week.stageId)
                  const color = stageColor(period?.name)
                  return (
                    <td
                      key={span.start}
                      colSpan={span.span}
                      className={`border-l border-border px-2 py-2 text-center text-xs font-medium ${color.bg} ${color.text}`}
                    >
                      {stage?.name ?? '—'}
                    </td>
                  )
                })}
              </tr>

              <tr className="border-b border-border">
                <RowLabel>Мезоциклы</RowLabel>
                {mesocycleSpans.map((span) => {
                  const entry = mainColumns[span.start]
                  if (entry.kind === 'empty-period') {
                    return (
                      <td key={span.start} colSpan={span.span} className="border-l border-border px-2 py-2 text-center text-xs text-text-secondary">
                        —
                      </td>
                    )
                  }
                  const mesocycle = columns.find((c) => c.id === entry.week.mesocycleId)
                  return (
                    <td key={span.start} colSpan={span.span} className="border-l border-border p-0 align-top">
                      <button
                        onClick={() => canEdit && mesocycle && setEditingMesocycle(mesocycle)}
                        className="flex w-full flex-col items-center gap-0.5 px-2 py-2 text-center hover:bg-surface-2"
                      >
                        <span className="text-xs font-medium">{entry.week.mesocycleName}</span>
                      </button>
                    </td>
                  )
                })}
              </tr>

              <tr>
                <RowLabel>Микроциклы</RowLabel>
                {mainColumns.map((entry) => {
                  const key = entry.kind === 'week' ? entry.week.microcycleId : `empty-${entry.period.id}`
                  if (entry.kind === 'empty-period') {
                    return (
                      <td key={key} className="border-l border-border p-1 text-center text-[11px] text-text-secondary">
                        —
                      </td>
                    )
                  }
                  const { week } = entry
                  return (
                    <td key={key} className="border-l border-border p-1 align-top">
                      {canEdit ? (
                        <select
                          value={week.microcycleType ?? ''}
                          onChange={(e) =>
                            mutate(`/api/periodization-microcycles/${week.microcycleId}`, 'PATCH', {
                              microcycleType: e.target.value || null,
                            })
                          }
                          className="w-full rounded border-none bg-transparent text-center text-[11px] outline-none"
                        >
                          <option value="">—</option>
                          {MICROCYCLE_PRESETS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="block text-center text-[11px]">{week.microcycleType ?? '—'}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <PeriodFormDialog
        open={periodDialogOpen}
        onOpenChange={setPeriodDialogOpen}
        athleteId={athleteId}
        onSaved={() => {
          setPeriodDialogOpen(false)
          router.refresh()
        }}
      />

      {editingPeriod && (
        <PeriodFormDialog
          open
          onOpenChange={(open) => !open && setEditingPeriod(null)}
          period={editingPeriod}
          onSaved={() => {
            setEditingPeriod(null)
            router.refresh()
          }}
        />
      )}

      {deletingPeriod && (
        <Dialog
          open
          onOpenChange={(open) => !open && setDeletingPeriod(null)}
          title="Удалить период?"
          description={`«${deletingPeriod.name}» — удалятся все этапы и мезоциклы внутри него.`}
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeletingPeriod(null)}>
              Отмена
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                const period = deletingPeriod
                setDeletingPeriod(null)
                await mutate(`/api/periods/${period.id}`, 'DELETE', undefined, 'Период удалён')
              }}
            >
              Удалить
            </Button>
          </div>
        </Dialog>
      )}

      {addToPeriod && (
        <AddToPeriodDialog
          period={addToPeriod}
          onClose={() => setAddToPeriod(null)}
          onDone={() => {
            setAddToPeriod(null)
            router.refresh()
          }}
        />
      )}

      {editingMesocycle && (
        <MesocycleEditorDialog
          mesocycle={editingMesocycle}
          periods={periods}
          onClose={() => setEditingMesocycle(null)}
          onSaved={() => {
            setEditingMesocycle(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

function RowLabel({ children }: { children?: string }) {
  return (
    <td className="sticky left-0 z-10 w-28 shrink-0 whitespace-nowrap bg-surface-2 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
      {children}
    </td>
  )
}

// Two-step "+" flow off a period cell: pick (or create) an Этап inside that
// period, then create the Мезоцикл scoped to it — the resulting weeks show
// up as new merged-cell columns under this period once the page refreshes.
// Creating the Мезоцикл itself is as lightweight as a Период/Этап (name +
// duration in weeks, no plan-name/weekday picker) — see CreateMesocycleDialog.
function AddToPeriodDialog({
  period,
  onClose,
  onDone,
}: {
  period: PeriodOption
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [stageId, setStageId] = useState('')
  const [presetName, setPresetName] = useState<string | undefined>(undefined)
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [stages, setStages] = useState(period.stages)
  const selectedStage = stages.find((s) => s.id === stageId)

  useEffect(() => {
    if (stageId === NEW_STAGE) setStageDialogOpen(true)
  }, [stageId])

  // Every standard Этап name is always selectable, not just the ones already
  // created for this period — picking one that doesn't exist yet here opens
  // the creation dialog with that name pre-filled instead of requiring a
  // separate "+ Добавить этап" round trip first.
  const missingPresets = STAGE_PRESETS.filter((name) => !stages.some((s) => s.name === name))

  function handleSelect(value: string) {
    if (value === NEW_STAGE) {
      setPresetName(undefined)
      setStageId(NEW_STAGE)
    } else if (value.startsWith('preset:')) {
      setPresetName(value.slice('preset:'.length))
      setStageId(NEW_STAGE)
    } else {
      setStageId(value)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()} title={`Добавить в «${period.name}»`}>
        <div className="space-y-3">
          <label className="block text-xs text-text-secondary">
            Этап
            <Select value={stageId} onChange={(e) => handleSelect(e.target.value)} className="mt-1 w-full">
              <option value="">Выберите этап...</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {missingPresets.map((name) => (
                <option key={name} value={`preset:${name}`}>
                  {name}
                </option>
              ))}
              <option value={NEW_STAGE}>+ Добавить этап (своё название и даты)</option>
            </Select>
          </label>

          {stageId === NEW_STAGE && (
            <p className="text-xs text-text-secondary">Укажи даты этапа во всплывшем окне, он появится в списке выше.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <CreateMesocycleDialog
              stageId={stageId && stageId !== NEW_STAGE ? stageId : undefined}
              defaultStartDate={selectedStage?.startDate}
              trigger={(open) => (
                <Button size="sm" disabled={!stageId || stageId === NEW_STAGE} onClick={open}>
                  <Plus className="h-4 w-4" /> Создать мезоцикл
                </Button>
              )}
              onCreated={onDone}
            />
          </div>
        </div>
      </Dialog>

      <StageFormDialog
        open={stageDialogOpen}
        onOpenChange={(open) => {
          setStageDialogOpen(open)
          if (!open) {
            setStageId((prev) => (prev === NEW_STAGE ? '' : prev))
            setPresetName(undefined)
          }
        }}
        periodId={period.id}
        initialName={presetName}
        onSaved={(stage) => {
          setStages((prev) => [...prev, stage])
          setStageId(stage.id)
          setPresetName(undefined)
          setStageDialogOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}

// Creates a Мезоцикл as lightly as a Период/Этап — name (from the standard
// preset list) + start date + duration in weeks, no plan-name/weekday
// picker. A standalone entity scoped to exactly one Stage (stageId is
// required) — see POST /api/stages/:stageId/mesocycles and the Mesocycle
// model's comment in schema.prisma for why this is deliberately NOT a real
// training plan/Cycle.
function CreateMesocycleDialog({
  stageId,
  defaultStartDate,
  trigger,
  onCreated,
}: {
  stageId?: string
  defaultStartDate?: string
  trigger: (open: () => void) => React.ReactNode
  onCreated: (mesocycleId: string) => void
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState<string>(MESOCYCLE_PRESETS[0])
  const [startDate, setStartDate] = useState(defaultStartDate ? fmt(defaultStartDate) : todayIso())
  const [durationWeeks, setDurationWeeks] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openDialog() {
    setName(MESOCYCLE_PRESETS[0])
    setStartDate(defaultStartDate ? fmt(defaultStartDate) : todayIso())
    setDurationWeeks(4)
    setError(null)
    setOpen(true)
  }

  async function handleSave() {
    if (!stageId) {
      setError('Сначала выберите этап')
      return
    }
    if (!startDate) {
      setError('Укажите дату начала')
      return
    }
    if (durationWeeks < 1 || durationWeeks > 52) {
      setError('Длительность: от 1 до 52 недель')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/stages/${stageId}/mesocycles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, startDate, weeks: durationWeeks }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось создать мезоцикл')
      }
      const mesocycle = await res.json()
      toast({ title: 'Мезоцикл создан', variant: 'success' })
      setOpen(false)
      onCreated(mesocycle.id)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось создать мезоцикл', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {trigger(openDialog)}
      <Dialog open={open} onOpenChange={setOpen} title="Новый мезоцикл">
        <div className="space-y-3">
          <label className="block text-xs text-text-secondary">
            Название
            <Select value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full">
              {MESOCYCLE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 text-xs text-text-secondary">
              Начало
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full" />
            </label>
            <label className="block flex-1 text-xs text-text-secondary">
              Длительность (недель)
              <Input
                type="number"
                min={1}
                max={52}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? 'Создаю...' : 'Создать'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function MesocycleEditorDialog({
  mesocycle,
  periods,
  onClose,
  onSaved,
}: {
  mesocycle: MesocycleColumn
  periods: PeriodOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [periodId, setPeriodId] = useState(mesocycle.periodId)
  const [stageId, setStageId] = useState(mesocycle.stageId)
  const [name, setName] = useState(mesocycle.name)
  const [loading, setLoading] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const period = periods.find((p) => p.id === periodId)

  async function save() {
    if (!stageId) {
      toast({ title: 'Выберите этап', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/mesocycles/${mesocycle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stageId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить')
      }
      toast({ title: 'Сохранено', variant: 'success' })
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function addWeek() {
    setLoading(true)
    try {
      const res = await fetch(`/api/mesocycles/${mesocycle.id}/microcycles`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось добавить неделю')
      }
      toast({ title: 'Неделя добавлена', variant: 'success' })
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось добавить неделю', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setLoading(true)
    try {
      const res = await fetch(`/api/mesocycles/${mesocycle.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось удалить')
      }
      toast({ title: 'Мезоцикл удалён', variant: 'success' })
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={mesocycle.name}>
      <div className="space-y-3">
        <label className="block text-xs text-text-secondary">
          Название
          <Select value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full">
            {MESOCYCLE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>

        <label className="block text-xs text-text-secondary">
          Период
          <Select
            value={periodId}
            onChange={(e) => {
              setPeriodId(e.target.value)
              setStageId('')
            }}
            className="mt-1 w-full"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block text-xs text-text-secondary">
          Этап
          <Select value={stageId} onChange={(e) => setStageId(e.target.value)} className="mt-1 w-full">
            <option value="">не выбран</option>
            {period?.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>

        {confirmingDelete ? (
          <div className="flex items-center justify-between gap-2 rounded border border-danger/40 bg-danger/10 px-2 py-2">
            <span className="text-xs">Удалить мезоцикл и все его недели?</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)}>
                Отмена
              </Button>
              <Button variant="danger" size="sm" onClick={handleDelete} disabled={loading}>
                Удалить
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addWeek} disabled={loading}>
                <Plus className="h-4 w-4" /> Неделя
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)} disabled={loading}>
                <Trash2 className="h-4 w-4" /> Удалить
              </Button>
            </div>
            <Button size="sm" onClick={save} disabled={loading}>
              Сохранить
            </Button>
          </div>
        )}
      </div>
    </Dialog>
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
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full" />
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
  initialName,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  periodId: string
  stage?: { id: string; name: string; startDate: string; endDate: string }
  // Pre-fills the name when creating (picked from the full Этап list before
  // this dialog even opened) — ignored once `stage` is set (editing).
  initialName?: string
  onSaved: (stage: { id: string; name: string; startDate: string; endDate: string }) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(stage?.name ?? initialName ?? STAGE_PRESETS[0])
  const [startDate, setStartDate] = useState(stage ? fmt(stage.startDate) : todayIso())
  const [endDate, setEndDate] = useState(stage ? fmt(stage.endDate) : todayIso())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(stage?.name ?? initialName ?? STAGE_PRESETS[0])
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
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full" />
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
