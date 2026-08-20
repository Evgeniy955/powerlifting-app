'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Pencil, Unlink } from 'lucide-react'
import { Button, Card, Dialog, Input, Select, useToast } from '@/components/ui'
import { CreatePlanDialog } from '@/components/CreatePlanDialog'
import { PERIOD_PRESETS, STAGE_PRESETS, MESOCYCLE_PRESETS, MICROCYCLE_PRESETS, periodColor, stageColor } from '@/lib/periodization'

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

// One week (Microcycle) flattened out of an attached Cycle, annotated with
// the period/stage it inherits — the unit a table column represents.
type WeekColumn = {
  microcycleId: string
  microcycleType: string | null
  weekStart: string
  cycleId: string
  cycleName: string
  cycleStartDate: string
  cycleWeeks: number
  mesocycleType: string | null
  stageId: string
  periodId: string
}

type Span = { key: string; start: number; span: number }

function groupConsecutive(items: WeekColumn[], keyFn: (item: WeekColumn) => string): Span[] {
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
// (Microcycle), four fixed rows underneath: Периоды / Этап / Мезоциклы /
// Микроциклы, matching the original planning sheet. Периоды/Этап/Мезоциклы
// render as merged cells (colSpan) spanning the weeks that belong to them;
// Микроциклы stays one cell per week. New content is always added "onto" an
// existing Период — each period pill above the table has its own "+" that
// walks through picking/creating an Этап and then creating the Мезоцикл
// (a real plan) inside it; the resulting weeks then appear as new columns.
// Clicking an existing Мезоцикл block reopens that same Период/Этап choice
// to move or detach it.
export function PeriodizationView({ athleteId, periods, columns, canEdit }: Props) {
  const router = useRouter()
  const toast = useToast()

  const [addToPeriod, setAddToPeriod] = useState<PeriodOption | null>(null)
  const [editingCycle, setEditingCycle] = useState<MesocycleColumn | null>(null)
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

  const weekColumns = useMemo<WeekColumn[]>(() => {
    const list: WeekColumn[] = []
    for (const cycle of columns) {
      if (!cycle.stageId || !cycle.periodId) continue
      for (const mc of cycle.microcycles) {
        list.push({
          microcycleId: mc.id,
          microcycleType: mc.microcycleType,
          weekStart: addDays(cycle.startDate, (mc.weekNumber - 1) * 7),
          cycleId: cycle.id,
          cycleName: cycle.name,
          cycleStartDate: cycle.startDate,
          cycleWeeks: cycle.weeks,
          mesocycleType: cycle.mesocycleType,
          stageId: cycle.stageId,
          periodId: cycle.periodId,
        })
      }
    }
    list.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    return list
  }, [columns])

  const unassigned = columns.filter((c) => !c.stageId)

  const periodSpans = useMemo(() => groupConsecutive(weekColumns, (c) => c.periodId), [weekColumns])
  const stageSpans = useMemo(() => groupConsecutive(weekColumns, (c) => c.stageId), [weekColumns])
  const cycleSpans = useMemo(() => groupConsecutive(weekColumns, (c) => c.cycleId), [weekColumns])

  function periodOf(id: string) {
    return periods.find((p) => p.id === id)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {periods.map((period) => (
            <PeriodPill
              key={period.id}
              period={period}
              canEdit={canEdit}
              onAdd={() => setAddToPeriod(period)}
              onEdited={() => router.refresh()}
            />
          ))}
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setPeriodDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Добавить период
          </Button>
        )}
      </div>

      {periods.length === 0 ? (
        <Card padding="md" className="text-center text-sm text-text-secondary">
          Периодов пока нет. Добавь первый — он задаёт длительность макроцикла (от 12 недель до года). Дальше через
          «+» у периода добавляются этапы и мезоциклы.
        </Card>
      ) : weekColumns.length === 0 ? (
        <Card padding="md" className="text-center text-sm text-text-secondary">
          В периодах пока нет мезоциклов.{canEdit && ' Нажми «+» у нужного периода, чтобы добавить этап и план.'}
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <RowLabel />
                  {weekColumns.map((c) => (
                    <th
                      key={c.microcycleId}
                      className="min-w-[92px] border-l border-border bg-surface-2 px-1.5 py-1.5 text-center text-[11px] font-normal text-text-secondary"
                    >
                      {fmtShort(c.weekStart)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <RowLabel>Периоды</RowLabel>
                  {periodSpans.map((span) => {
                    const period = periodOf(span.key)
                    const color = periodColor(period?.name)
                    return (
                      <td
                        key={span.start}
                        colSpan={span.span}
                        className={`border-l border-border px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide ${color.bg} ${color.text}`}
                      >
                        {period?.name ?? '—'}
                      </td>
                    )
                  })}
                </tr>

                <tr className="border-b border-border">
                  <RowLabel>Этап</RowLabel>
                  {stageSpans.map((span) => {
                    const column = weekColumns[span.start]
                    const period = periodOf(column.periodId)
                    const stage = period?.stages.find((s) => s.id === column.stageId)
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
                  {cycleSpans.map((span) => {
                    const column = weekColumns[span.start]
                    const cycle = columns.find((c) => c.id === column.cycleId)
                    return (
                      <td
                        key={span.start}
                        colSpan={span.span}
                        className="border-l border-border p-0 align-top"
                      >
                        <button
                          onClick={() => canEdit && cycle && setEditingCycle(cycle)}
                          className="flex w-full flex-col items-center gap-0.5 px-2 py-2 text-center hover:bg-surface-2"
                        >
                          <Link
                            href={`/cycles/${column.cycleId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs font-medium hover:text-accent"
                          >
                            {column.cycleName}
                          </Link>
                          <span className="text-[11px] text-text-secondary">
                            {column.mesocycleType ?? 'тип не указан'}
                          </span>
                        </button>
                      </td>
                    )
                  })}
                </tr>

                <tr>
                  <RowLabel>Микроциклы</RowLabel>
                  {weekColumns.map((c) => (
                    <td key={c.microcycleId} className="border-l border-border p-1 align-top">
                      {canEdit ? (
                        <select
                          value={c.microcycleType ?? ''}
                          onChange={(e) =>
                            mutate(`/api/microcycles/${c.microcycleId}`, 'PATCH', {
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
                        <span className="block text-center text-[11px]">{c.microcycleType ?? '—'}</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {unassigned.length > 0 && (
        <Card padding="md" className="space-y-2">
          <p className="text-sm font-medium text-text-secondary">Планы вне периодизации</p>
          <div className="space-y-1">
            {unassigned.map((cycle) => (
              <div key={cycle.id} className="flex items-center justify-between text-sm">
                <Link href={`/cycles/${cycle.id}`} className="hover:text-accent">
                  {cycle.name}
                </Link>
                <span className="text-xs text-text-secondary">
                  {fmt(cycle.startDate)} · {cycle.weeks} нед.
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <PeriodFormDialog
        open={periodDialogOpen}
        onOpenChange={setPeriodDialogOpen}
        athleteId={athleteId}
        onSaved={() => {
          setPeriodDialogOpen(false)
          router.refresh()
        }}
      />

      {addToPeriod && (
        <AddToPeriodDialog
          period={addToPeriod}
          athleteId={athleteId}
          onClose={() => setAddToPeriod(null)}
          onDone={() => {
            setAddToPeriod(null)
            router.refresh()
          }}
        />
      )}

      {editingCycle && (
        <MesocycleEditorDialog
          cycle={editingCycle}
          periods={periods}
          onClose={() => setEditingCycle(null)}
          onSaved={() => {
            setEditingCycle(null)
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

function PeriodPill({
  period,
  canEdit,
  onAdd,
  onEdited,
}: {
  period: PeriodOption
  canEdit: boolean
  onAdd: () => void
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
        <>
          <button onClick={() => setEditOpen(true)} className="rounded p-0.5 hover:bg-black/10" aria-label="Редактировать период">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={onAdd} className="rounded p-0.5 hover:bg-black/10" aria-label="Добавить в период" title="Добавить этап/мезоцикл в этот период">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
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

// Two-step "+" flow off a period pill: pick (or create) an Этап inside that
// period, then create the Мезоцикл (a real plan, via CreatePlanDialog)
// scoped to it — the resulting weeks show up as new merged-cell columns
// under this period once the page refreshes.
function AddToPeriodDialog({
  period,
  athleteId,
  onClose,
  onDone,
}: {
  period: PeriodOption
  athleteId: string
  onClose: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const [stageId, setStageId] = useState('')
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [stages, setStages] = useState(period.stages)

  useEffect(() => {
    if (stageId === NEW_STAGE) setStageDialogOpen(true)
  }, [stageId])

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()} title={`Добавить в «${period.name}»`}>
        <div className="space-y-3">
          <label className="block text-xs text-text-secondary">
            Этап
            <Select value={stageId} onChange={(e) => setStageId(e.target.value)} className="mt-1 w-full">
              <option value="">Выберите этап...</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_STAGE}>+ Добавить этап</option>
            </Select>
          </label>

          {stageId === NEW_STAGE && (
            <p className="text-xs text-text-secondary">Создай этап во всплывшем окне, он появится в списке выше.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Отмена
            </Button>
            <CreatePlanDialog
              athleteId={athleteId}
              stageId={stageId && stageId !== NEW_STAGE ? stageId : undefined}
              trigger={(open) => (
                <Button
                  size="sm"
                  disabled={!stageId || stageId === NEW_STAGE}
                  onClick={open}
                >
                  <Plus className="h-4 w-4" /> Создать план
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
          if (!open) setStageId((prev) => (prev === NEW_STAGE ? '' : prev))
        }}
        periodId={period.id}
        onSaved={(stage) => {
          setStages((prev) => [...prev, stage])
          setStageId(stage.id)
          setStageDialogOpen(false)
          router.refresh()
        }}
      />
    </>
  )
}

function MesocycleEditorDialog({
  cycle,
  periods,
  onClose,
  onSaved,
}: {
  cycle: MesocycleColumn
  periods: PeriodOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [periodId, setPeriodId] = useState(cycle.periodId ?? '')
  const [stageId, setStageId] = useState(cycle.stageId ?? '')
  const [mesocycleType, setMesocycleType] = useState(cycle.mesocycleType ?? '')
  const [loading, setLoading] = useState(false)
  const period = periods.find((p) => p.id === periodId)

  async function save(patch: Record<string, unknown>) {
    setLoading(true)
    try {
      const res = await fetch(`/api/cycles/${cycle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
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
      const res = await fetch(`/api/cycles/${cycle.id}/microcycles`, { method: 'POST' })
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={cycle.name}>
      <div className="space-y-3">
        <Link href={`/cycles/${cycle.id}`} className="text-xs text-accent hover:underline">
          Открыть план →
        </Link>

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
            <option value="">не выбран</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block text-xs text-text-secondary">
          Этап
          <Select
            value={stageId}
            disabled={!period}
            onChange={(e) => setStageId(e.target.value)}
            className="mt-1 w-full"
          >
            <option value="">{period ? 'не выбран' : 'сначала период'}</option>
            {period?.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block text-xs text-text-secondary">
          Тип мезоцикла
          <Select value={mesocycleType} onChange={(e) => setMesocycleType(e.target.value)} className="mt-1 w-full">
            <option value="">не указан</option>
            {MESOCYCLE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={addWeek} disabled={loading}>
            <Plus className="h-4 w-4" /> Неделя
          </Button>
          <div className="flex gap-2">
            {cycle.stageId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => save({ stageId: null })}
                disabled={loading}
              >
                <Unlink className="h-4 w-4" /> Открепить
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => save({ stageId: stageId || null, mesocycleType: mesocycleType || null })}
              disabled={loading}
            >
              Сохранить
            </Button>
          </div>
        </div>
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
