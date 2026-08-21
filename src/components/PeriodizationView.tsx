'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Layers } from 'lucide-react'
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

// A table column is a real week, or a placeholder standing in for
// something that exists but has nothing under it yet: an 'empty-stage' for
// a Этап with no mesocycles (own column, shows the real этап name — without
// this an Этап you just created was invisible, since it had zero weeks to
// derive a column from and only periods got an empty-state column), or an
// 'empty-period' for a Период with no stages at all yet. Either way every
// Период/Этап you create always has a home inside the table itself rather
// than needing a separate list above it.
type ColumnEntry =
  | { kind: 'week'; sortKey: string; week: WeekColumn }
  | { kind: 'empty-stage'; sortKey: string; period: PeriodOption; stage: StageOption }
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
  const [editingWeek, setEditingWeek] = useState<WeekColumn | null>(null)
  const [editingPeriod, setEditingPeriod] = useState<PeriodOption | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<PeriodOption | null>(null)
  const [editingStage, setEditingStage] = useState<{ stage: StageOption; periodId: string } | null>(null)
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [addingStageToPeriod, setAddingStageToPeriod] = useState<PeriodOption | null>(null)

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
    const stagesWithWeeks = new Set<string>()

    for (const mesocycle of columns) {
      stagesWithWeeks.add(mesocycle.stageId)
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
      if (period.stages.length === 0) {
        entries.push({ kind: 'empty-period', sortKey: period.startDate, period })
        continue
      }
      for (const stage of period.stages) {
        if (!stagesWithWeeks.has(stage.id)) {
          entries.push({ kind: 'empty-stage', sortKey: stage.startDate, period, stage })
        }
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
    () =>
      groupConsecutive(mainColumns, (e) =>
        e.kind === 'week' ? e.week.stageId : e.kind === 'empty-stage' ? e.stage.id : `empty-${e.period.id}`
      ),
    [mainColumns]
  )
  const mesocycleSpans = useMemo(
    () =>
      groupConsecutive(mainColumns, (e) =>
        e.kind === 'week' ? e.week.mesocycleId : e.kind === 'empty-stage' ? `empty-stage-${e.stage.id}` : `empty-${e.period.id}`
      ),
    [mainColumns]
  )

  function periodOf(id: string) {
    return periods.find((p) => p.id === id)
  }

  const editingStagePeriod = editingStage ? periodOf(editingStage.periodId) : undefined

  function periodIdOfEntry(e: ColumnEntry): string {
    return e.kind === 'week' ? e.week.periodId : e.period.id
  }

  // Where a new mesocycle in this stage should default to starting — right
  // after whichever of its existing mesocycles ends latest, or the stage's
  // own start if it has none yet. Same rule AddToPeriodDialog already uses,
  // pulled out here so the Этап row's own "+" (which knows its stage
  // directly, no period/этап picker needed) can offer a second, third, etc.
  // mesocycle in the same stage without colliding dates.
  function suggestedMesocycleStart(stageId: string, stageStartDate: string) {
    const inStage = columns.filter((c) => c.stageId === stageId)
    if (inStage.length === 0) return stageStartDate
    const latestEnd = inStage.reduce((latest, c) => Math.max(latest, new Date(addDays(c.startDate, c.weeks * 7)).getTime()), 0)
    return new Date(latestEnd).toISOString()
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
                    key={c.kind === 'week' ? c.week.microcycleId : c.kind === 'empty-stage' ? `empty-stage-${c.stage.id}` : `empty-${c.period.id}`}
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
                      key={span.key}
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
                        {period
                          ? `${fmtShort(period.startDate)} – ${fmtShort(period.endDate)} · ${weeksBetween(period.startDate, period.endDate)} нед.`
                          : ''}
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
                {stageSpans.map((span, spanIndex) => {
                  const entry = mainColumns[span.start]
                  if (entry.kind === 'empty-period') {
                    return (
                      <td key={span.key} colSpan={span.span} className="border-l border-border px-2 py-2 text-center text-xs text-text-secondary">
                        —
                      </td>
                    )
                  }
                  // A period with at least one Этап already had no direct
                  // way to add another straight from this row — only the
                  // Период row's own "+" (a multi-step Этап-picker dialog
                  // not visually tied to this row), which looked like there
                  // was simply no way to add a stage at all. Adding a
                  // whole extra table column here would misalign every row
                  // below it (they all share the same week-column grid), so
                  // the "+" instead joins the other icons already packed
                  // into whichever stage cell is last for its period.
                  const periodId = periodIdOfEntry(entry)
                  const nextSpan = stageSpans[spanIndex + 1]
                  const isLastForPeriod = !nextSpan || periodIdOfEntry(mainColumns[nextSpan.start]) !== periodId
                  const period = periodOf(periodId)
                  // Deliberately a different icon and a dashed border,
                  // not just another plain "+" — sitting right next to the
                  // "add mesocycle" plus, an identical-looking icon here
                  // was mistaken for it (added a Мезоцикл when a whole new
                  // Этап was wanted, or vice versa). The dashed-circle look
                  // matches the ghost "+ Добавить период" button — same
                  // "this creates a new container" meaning, one level down.
                  const addStageButton = canEdit && isLastForPeriod && period && (
                    <>
                      <StageFormDialog
                        open={addingStageToPeriod?.id === period.id}
                        onOpenChange={(open) => !open && setAddingStageToPeriod(null)}
                        period={period}
                        onSaved={() => {
                          setAddingStageToPeriod(null)
                          router.refresh()
                        }}
                      />
                      <button
                        onClick={() => setAddingStageToPeriod(period)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dashed border-current opacity-70 hover:opacity-100"
                        title="Новый этап в этом периоде (не мезоцикл)"
                        aria-label="Добавить этап"
                      >
                        <Layers className="h-2.5 w-2.5" />
                      </button>
                    </>
                  )
                  if (entry.kind === 'empty-stage') {
                    const color = stageColor(entry.period.name)
                    const weeksLabel = `${fmtShort(entry.stage.startDate)} – ${fmtShort(entry.stage.endDate)} · ${weeksBetween(entry.stage.startDate, entry.stage.endDate)} нед.`
                    return (
                      <td key={span.key} colSpan={span.span} className={`border-l border-border p-0 align-top ${color.bg} ${color.text}`}>
                        {canEdit ? (
                          <div className="px-2 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => setEditingStage({ stage: entry.stage, periodId: entry.period.id })} className="truncate text-xs font-medium hover:underline">
                                {entry.stage.name}
                              </button>
                              <CreateMesocycleDialog
                                stageId={entry.stage.id}
                                defaultStartDate={suggestedMesocycleStart(entry.stage.id, entry.stage.startDate)}
                                stageEndDate={entry.stage.endDate}
                                trigger={(open) => (
                                  <button onClick={open} className="shrink-0 rounded p-0.5 hover:bg-black/10" title="Добавить мезоцикл в этот этап" aria-label="Добавить мезоцикл">
                                    <Plus className="h-3 w-3" />
                                  </button>
                                )}
                                onCreated={() => router.refresh()}
                              />
                              {addStageButton}
                            </div>
                            <span className="mt-0.5 block text-[10px] font-normal opacity-80">{weeksLabel}</span>
                          </div>
                        ) : (
                          <span className="block px-2 py-2 text-center">
                            <span className="block text-xs font-medium">{entry.stage.name}</span>
                            <span className="mt-0.5 block text-[10px] font-normal opacity-80">{weeksLabel}</span>
                          </span>
                        )}
                      </td>
                    )
                  }
                  const stage = period?.stages.find((s) => s.id === entry.week.stageId)
                  const color = stageColor(period?.name)
                  const weeksLabel = stage
                    ? `${fmtShort(stage.startDate)} – ${fmtShort(stage.endDate)} · ${weeksBetween(stage.startDate, stage.endDate)} нед.`
                    : ''
                  return (
                    <td key={span.key} colSpan={span.span} className={`border-l border-border p-0 align-top ${color.bg} ${color.text}`}>
                      {canEdit && stage && period ? (
                        <div className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditingStage({ stage, periodId: period.id })} className="truncate text-xs font-medium hover:underline">
                              {stage.name}
                            </button>
                            <CreateMesocycleDialog
                              stageId={stage.id}
                              defaultStartDate={suggestedMesocycleStart(stage.id, stage.startDate)}
                              stageEndDate={stage.endDate}
                              trigger={(open) => (
                                <button onClick={open} className="shrink-0 rounded p-0.5 hover:bg-black/10" title="Добавить ещё мезоцикл в этот этап" aria-label="Добавить мезоцикл">
                                  <Plus className="h-3 w-3" />
                                </button>
                              )}
                              onCreated={() => router.refresh()}
                            />
                            {addStageButton}
                          </div>
                          <span className="mt-0.5 block text-[10px] font-normal opacity-80">{weeksLabel}</span>
                        </div>
                      ) : (
                        <span className="block px-2 py-2 text-center">
                          <span className="block text-xs font-medium">{stage?.name ?? '—'}</span>
                          {stage && <span className="mt-0.5 block text-[10px] font-normal opacity-80">{weeksLabel}</span>}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>

              <tr className="border-b border-border">
                <RowLabel>Мезоциклы</RowLabel>
                {mesocycleSpans.map((span) => {
                  const entry = mainColumns[span.start]
                  // A stage with no mesocycles yet used to render a dead "—"
                  // here with nothing to click — the only way in was the
                  // Период "+" button's multi-step Этап-picker flow, which
                  // isn't obviously connected to this row. Since the stage
                  // is already known at this point, open mesocycle creation
                  // for it directly.
                  if (entry.kind === 'empty-stage') {
                    return (
                      <td key={span.key} colSpan={span.span} className="border-l border-border p-0 align-top">
                        {canEdit ? (
                          <CreateMesocycleDialog
                            stageId={entry.stage.id}
                            defaultStartDate={entry.stage.startDate}
                            stageEndDate={entry.stage.endDate}
                            trigger={(open) => (
                              <button
                                onClick={open}
                                className="flex w-full flex-col items-center gap-0.5 px-2 py-2 text-center text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                                title="Создать мезоцикл в этом этапе"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                            onCreated={() => router.refresh()}
                          />
                        ) : (
                          <span className="block px-2 py-2 text-center text-xs text-text-secondary">—</span>
                        )}
                      </td>
                    )
                  }
                  if (entry.kind !== 'week') {
                    return (
                      <td key={span.key} colSpan={span.span} className="border-l border-border px-2 py-2 text-center text-xs text-text-secondary">
                        —
                      </td>
                    )
                  }
                  const mesocycle = columns.find((c) => c.id === entry.week.mesocycleId)
                  return (
                    <td key={span.key} colSpan={span.span} className="border-l border-border p-0 align-top">
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
                  const key =
                    entry.kind === 'week' ? entry.week.microcycleId : entry.kind === 'empty-stage' ? `empty-stage-${entry.stage.id}` : `empty-${entry.period.id}`
                  if (entry.kind !== 'week') {
                    return (
                      <td key={key} className="border-l border-border p-1 text-center text-[11px] text-text-secondary">
                        —
                      </td>
                    )
                  }
                  const { week } = entry
                  return (
                    <td key={key} className="border-l border-border p-0 align-top">
                      {canEdit ? (
                        <button
                          onClick={() => setEditingWeek(week)}
                          className="flex w-full flex-col items-center gap-0.5 px-2 py-2 text-center hover:bg-surface-2"
                        >
                          <span className="text-[11px]">{week.microcycleType ?? '—'}</span>
                        </button>
                      ) : (
                        <span className="block px-2 py-2 text-center text-[11px]">{week.microcycleType ?? '—'}</span>
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
        periods={periods}
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
          periods={periods}
          onSaved={() => {
            setEditingPeriod(null)
            router.refresh()
          }}
        />
      )}

      {editingStage && editingStagePeriod && (
        <StageFormDialog
          open
          onOpenChange={(open) => !open && setEditingStage(null)}
          period={editingStagePeriod}
          stage={editingStage.stage}
          onSaved={() => {
            setEditingStage(null)
            router.refresh()
          }}
          onDeleted={() => {
            setEditingStage(null)
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
          columns={columns}
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

      {editingWeek && (
        <MicrocycleEditorDialog
          week={editingWeek}
          onClose={() => setEditingWeek(null)}
          onSaved={() => {
            setEditingWeek(null)
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
  columns,
  onClose,
  onDone,
}: {
  period: PeriodOption
  columns: MesocycleColumn[]
  onClose: () => void
  onDone: () => void
}) {
  const [stageId, setStageId] = useState('')
  const [presetName, setPresetName] = useState<string | undefined>(undefined)
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  // No longer tracked as local state that grows as stages get created in
  // this same session — creating a new Этап now closes the whole wizard
  // (see the StageFormDialog onSaved below), so this always just reads the
  // period's own current stage list.
  const selectedStage = period.stages.find((s) => s.id === stageId)

  // Default the new mesocycle's start date to right after whichever
  // existing mesocycle in this stage ends latest, rather than always the
  // stage's own start date — otherwise two mesocycles created back-to-back
  // both default to the same day and silently overlap (see the "Втягивающий"
  // duplicate this replaced).
  const suggestedStartDate = useMemo(() => {
    if (!selectedStage) return undefined
    const inStage = columns.filter((c) => c.stageId === selectedStage.id)
    if (inStage.length === 0) return selectedStage.startDate
    const latestEnd = inStage.reduce(
      (latest, c) => Math.max(latest, new Date(addDays(c.startDate, c.weeks * 7)).getTime()),
      0
    )
    return new Date(latestEnd).toISOString()
  }, [selectedStage, columns])

  useEffect(() => {
    if (stageId === NEW_STAGE) setStageDialogOpen(true)
  }, [stageId])

  // Every standard Этап name is always selectable, not just the ones already
  // created for this period — picking one that doesn't exist yet here opens
  // the creation dialog with that name pre-filled instead of requiring a
  // separate "+ Добавить этап" round trip first.
  const missingPresets = STAGE_PRESETS.filter((name) => !period.stages.some((s) => s.name === name))

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
              {period.stages.map((s) => (
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
              defaultStartDate={suggestedStartDate}
              stageEndDate={selectedStage?.endDate}
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
        period={period}
        initialName={presetName}
        // Used to stay open afterwards on an "Этап created, now pick it and
        // create a Мезоцикл" step — the Select still showing "Этап" with
        // "+ Добавить этап" as one of its options, right after the coach
        // had just used that very option, read as the popup asking them to
        // add another stage. Every stage (including one with zero
        // mesocycles yet) now gets its own "+" in the table itself (see
        // addStageButton/CreateMesocycleDialog on the Этап row), so this
        // wizard no longer needs to be the only path into mesocycle
        // creation — close it outright and let the coach use that "+" on
        // the stage they just made, whenever they're ready for it.
        onSaved={() => {
          setStageDialogOpen(false)
          onDone()
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
// A child only has so many free weeks left after `startDate` before it runs
// into its own parent's boundary — capping at 52 (the field's own ceiling)
// when there's no bound to check against yet (e.g. nothing picked yet).
// Used for both Мезоцикл-in-Этап and Этап-in-Период: picks a default
// duration that won't immediately fail the "must stay inside the parent"
// check on the API side (see rangeContains in dateOverlap.ts), and caps the
// duration input itself.
function maxWeeksUntil(startDate: string, boundEndDate?: string): number {
  if (!boundEndDate || !startDate) return 52
  const days = (new Date(boundEndDate).getTime() - new Date(startDate).getTime()) / DAY_MS
  return Math.max(0, Math.min(52, Math.floor(days / 7)))
}

// Where a new Этап in this period should default to starting — right after
// whichever of its existing Этапы (besides the one being edited, if any)
// ends latest, or the period's own start if it has none yet. Same
// collision-avoiding rule already used for Мезоцикл-in-Этап.
function suggestedStageStart(period: PeriodOption, excludeStageId?: string): string {
  const siblings = period.stages.filter((s) => s.id !== excludeStageId)
  if (siblings.length === 0) return period.startDate
  const latestEnd = siblings.reduce((latest, s) => Math.max(latest, new Date(s.endDate).getTime()), 0)
  return new Date(latestEnd).toISOString()
}

// Where a new Период should default to starting — right after whichever of
// the athlete's existing Периоды ends latest, or today if there are none
// yet. Периоды have no parent to stay contained inside (unlike Этап/
// Мезоцикл), so this is just the sibling half of the same rule.
function suggestedPeriodStart(periods: PeriodOption[]): string {
  if (periods.length === 0) return todayIso()
  const latestEnd = periods.reduce((latest, p) => Math.max(latest, new Date(p.endDate).getTime()), 0)
  return new Date(latestEnd).toISOString()
}

function CreateMesocycleDialog({
  stageId,
  defaultStartDate,
  stageEndDate,
  trigger,
  onCreated,
}: {
  stageId?: string
  defaultStartDate?: string
  stageEndDate?: string
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

  const maxWeeks = maxWeeksUntil(startDate, stageEndDate)

  function openDialog() {
    const initialStart = defaultStartDate ? fmt(defaultStartDate) : todayIso()
    setName(MESOCYCLE_PRESETS[0])
    setStartDate(initialStart)
    // Default to 4 weeks like before, but never more than what's actually
    // left in the stage — otherwise the "+ Создать мезоцикл" button fails
    // every single time in a stage shorter than 4 weeks (this is what broke
    // creating mesocycles/microcycles after the stage-bounds check landed).
    setDurationWeeks(Math.max(1, Math.min(4, maxWeeksUntil(initialStart, stageEndDate))))
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
    if (maxWeeks < 1) {
      setError('В этом этапе не осталось свободных недель — сдвиньте дату начала или измените даты этапа')
      return
    }
    if (durationWeeks > maxWeeks) {
      setError(`В этом этапе осталось ${maxWeeks} нед. с этой даты начала — уменьшите длительность`)
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
                max={maxWeeks > 0 ? maxWeeks : 52}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
          </div>
          {stageEndDate && (
            <p className="text-xs text-text-secondary">
              {maxWeeks > 0
                ? `Свободно в этапе: ${maxWeeks} нед. (до ${fmtShort(stageEndDate)})`
                : `В этапе не осталось места после ${fmtShort(startDate)}`}
            </p>
          )}
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
  const [startDate, setStartDate] = useState(fmt(mesocycle.startDate))
  const [durationWeeks, setDurationWeeks] = useState(mesocycle.weeks)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const period = periods.find((p) => p.id === periodId)

  async function save() {
    if (!stageId) {
      toast({ title: 'Выберите этап', variant: 'error' })
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
      const res = await fetch(`/api/mesocycles/${mesocycle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, stageId, startDate, weeks: durationWeeks }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось сохранить')
      }
      toast({ title: 'Сохранено', variant: 'success' })
      onSaved()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      setError(message)
      toast({ title: 'Не удалось сохранить', description: message, variant: 'error' })
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
        <p className="text-xs text-text-secondary">Окончание: {fmtShort(addDays(startDate || todayIso(), durationWeeks * 7))}</p>
        {error && <p className="text-xs text-danger">{error}</p>}

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
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)} disabled={loading}>
              <Trash2 className="h-4 w-4" /> Удалить
            </Button>
            <Button size="sm" onClick={save} disabled={loading}>
              Сохранить
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}

// Same click-to-open popup pattern as MesocycleEditorDialog above, just for
// a single week — pick the Микроцикл type from the preset list and save,
// instead of the old inline native <select> in the table cell.
function MicrocycleEditorDialog({
  week,
  onClose,
  onSaved,
}: {
  week: WeekColumn
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [microcycleType, setMicrocycleType] = useState(week.microcycleType ?? '')
  const [loading, setLoading] = useState(false)

  async function save() {
    setLoading(true)
    try {
      const res = await fetch(`/api/periodization-microcycles/${week.microcycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microcycleType: microcycleType || null }),
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={`Микроцикл — ${fmtShort(week.weekStart)}`}>
      <div className="space-y-3">
        <label className="block text-xs text-text-secondary">
          Тип микроцикла
          <Select value={microcycleType} onChange={(e) => setMicrocycleType(e.target.value)} className="mt-1 w-full">
            <option value="">не указан</option>
            {MICROCYCLE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" onClick={save} disabled={loading}>
            Сохранить
          </Button>
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
  periods,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  athleteId?: string
  period?: { id: string; name: string; startDate: string; endDate: string }
  // Existing periods for this athlete — used only when creating (period is
  // undefined) to default the start date to right after whichever period
  // ends latest, same rule as suggestedStageStart for Этап-in-Период.
  periods: PeriodOption[]
  onSaved: (period: { id: string; name: string; startDate: string; endDate: string }) => void
}) {
  const toast = useToast()
  const [name, setName] = useState(period?.name ?? PERIOD_PRESETS[0])
  const [startDate, setStartDate] = useState(period ? fmt(period.startDate) : fmt(suggestedPeriodStart(periods)))
  const [durationWeeks, setDurationWeeks] = useState(period ? weeksBetween(period.startDate, period.endDate) : 12)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(period?.name ?? PERIOD_PRESETS[0])
    setStartDate(period ? fmt(period.startDate) : fmt(suggestedPeriodStart(periods)))
    setDurationWeeks(period ? weeksBetween(period.startDate, period.endDate) : 12)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSave() {
    if (!startDate) {
      setError('Укажите дату начала')
      return
    }
    if (durationWeeks < 1) {
      setError('Длительность должна быть не меньше 1 недели')
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
              min={1}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <p className="text-xs text-text-secondary">Окончание: {fmtShort(addDays(startDate || todayIso(), durationWeeks * 7))}</p>
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
  period,
  stage,
  initialName,
  onSaved,
  onDeleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Used for its own id (fetch URL) plus, when creating (stage undefined),
  // its startDate/endDate/stages — same "must stay inside the parent" rule
  // as CreateMesocycleDialog vs. its stage: default start goes right after
  // whichever existing Этап in this period ends latest (or the period's own
  // start if it has none), and duration clamps to what's actually left,
  // instead of a fixed today's-date + 12 weeks that almost never fits
  // inside an existing, already-dated period and used to fail the
  // containment/overlap checks on every save.
  period: PeriodOption
  stage?: { id: string; name: string; startDate: string; endDate: string }
  // Pre-fills the name when creating (picked from the full Этап list before
  // this dialog even opened) — ignored once `stage` is set (editing).
  initialName?: string
  onSaved: (stage: { id: string; name: string; startDate: string; endDate: string }) => void
  // Only relevant when editing (stage is set) — lets the coach remove a
  // stage entirely (e.g. an accidental duplicate created before the
  // overlap guard existed), same confirm-then-delete pattern as the
  // Мезоцикл editor.
  onDeleted?: () => void
}) {
  const toast = useToast()
  const initialStartFor = (s?: typeof stage) => (s ? fmt(s.startDate) : fmt(suggestedStageStart(period)))
  const [name, setName] = useState(stage?.name ?? initialName ?? STAGE_PRESETS[0])
  const [startDate, setStartDate] = useState(initialStartFor(stage))
  const [durationWeeks, setDurationWeeks] = useState(
    stage ? weeksBetween(stage.startDate, stage.endDate) : Math.max(1, Math.min(12, maxWeeksUntil(initialStartFor(stage), period.endDate)))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const maxWeeks = maxWeeksUntil(startDate, period.endDate)

  useEffect(() => {
    if (!open) return
    const initialStart = initialStartFor(stage)
    setName(stage?.name ?? initialName ?? STAGE_PRESETS[0])
    setStartDate(initialStart)
    setDurationWeeks(stage ? weeksBetween(stage.startDate, stage.endDate) : Math.max(1, Math.min(12, maxWeeksUntil(initialStart, period.endDate))))
    setError(null)
    setConfirmingDelete(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSave() {
    if (!startDate) {
      setError('Укажите дату начала')
      return
    }
    if (durationWeeks < 1) {
      setError('Длительность должна быть не меньше 1 недели')
      return
    }
    if (maxWeeks < 1) {
      setError('В периоде не осталось свободных недель — сдвиньте дату начала или измените даты периода')
      return
    }
    if (durationWeeks > maxWeeks) {
      setError(`В периоде осталось ${maxWeeks} нед. с этой даты начала — уменьшите длительность`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const endDate = addDays(startDate, durationWeeks * 7)
      const url = stage ? `/api/stages/${stage.id}` : `/api/periods/${period.id}/stages`
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

  async function handleDelete() {
    if (!stage) return
    setLoading(true)
    try {
      const res = await fetch(`/api/stages/${stage.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Не удалось удалить')
      }
      toast({ title: 'Этап удалён', variant: 'success' })
      onDeleted?.()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка'
      toast({ title: 'Не удалось удалить', description: message, variant: 'error' })
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
            Длительность (недель)
            <Input
              type="number"
              min={1}
              max={maxWeeks > 0 ? maxWeeks : undefined}
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <p className="text-xs text-text-secondary">Окончание: {fmtShort(addDays(startDate || todayIso(), durationWeeks * 7))}</p>
        <p className="text-xs text-text-secondary">
          {maxWeeks > 0 ? `Свободно в периоде: ${maxWeeks} нед. (до ${fmtShort(period.endDate)})` : `В периоде не осталось места после ${fmtShort(startDate)}`}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        {stage && confirmingDelete ? (
          <div className="flex items-center justify-between gap-2 rounded border border-danger/40 bg-danger/10 px-2 py-2">
            <span className="text-xs">Удалить этап и все мезоциклы внутри него?</span>
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
        <div className="flex justify-between gap-2">
          {stage && (
            <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(true)} disabled={loading}>
              <Trash2 className="h-4 w-4" /> Удалить
            </Button>
          )}
            <div className="flex flex-1 justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button size="sm" onClick={handleSave} disabled={loading}>
                {loading ? 'Сохраняю...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
