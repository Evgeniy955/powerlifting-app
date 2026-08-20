'use client'

import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui'
import {
  MESOCYCLE_PRESETS,
  MICROCYCLE_PRESETS,
  PERIOD_PRESETS,
  STAGE_PRESETS,
  periodColor,
  stageColor,
} from '@/lib/periodization'

export type PeriodizationCycle = {
  id: string
  name: string
  startDate: string // ISO
  weeks: number
  periodType: string | null
  stageType: string | null
  mesocycleType: string | null
  microcycles: {
    id: string
    weekNumber: number
    microcycleType: string | null
  }[]
}

type Props = {
  athleteId: string
  cycles: PeriodizationCycle[]
  canEdit: boolean
}

// One flattened timeline column = one microcycle (week), carrying its own
// computed date range plus a reference to the cycle (mesocycle) it belongs
// to, so every row can be derived from this single ordered list.
type Column = {
  cycleId: string
  cycle: PeriodizationCycle
  microcycleId: string
  weekNumber: number
  microcycleType: string | null
  startDate: Date
  endDate: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

function dateLabel(d: Date): string {
  return d.toISOString().slice(0, 10).split('-').reverse().join('.')
}

function buildColumns(cycles: PeriodizationCycle[]): Column[] {
  const columns: Column[] = []
  for (const cycle of cycles) {
    const cycleStart = new Date(cycle.startDate)
    for (const mc of cycle.microcycles) {
      const start = new Date(cycleStart.getTime() + (mc.weekNumber - 1) * 7 * DAY_MS)
      const end = new Date(start.getTime() + 6 * DAY_MS)
      columns.push({
        cycleId: cycle.id,
        cycle,
        microcycleId: mc.id,
        weekNumber: mc.weekNumber,
        microcycleType: mc.microcycleType,
        startDate: start,
        endDate: end,
      })
    }
  }
  return columns
}

// Merges consecutive columns that share the same group key into one spanning
// cell — used for the Периоды/Этапы/Мезоциклы rows. Two cycles that happen to
// share the same tag (e.g. two "Базовый" mesocycles back to back) still stay
// separate groups if includeCycleBoundary is set, since each is still its
// own distinct plan/click target underneath.
function groupConsecutive(
  columns: Column[],
  keyFn: (col: Column) => string
): { key: string; start: number; span: number; column: Column }[] {
  const groups: { key: string; start: number; span: number; column: Column }[] = []
  columns.forEach((col, i) => {
    const key = keyFn(col)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.span++
    } else {
      groups.push({ key, start: i, span: 1, column: col })
    }
  })
  return groups
}

const CELL_W = 'min-w-[92px] max-w-[92px]'

// Season overview timeline — reproduces the classic Период/Этап/Мезоцикл/
// Микроцикл periodization sheet. Периоды/Этапы are derived, merged,
// read-only rows (colored, so the season's shape is visible at a glance);
// Период/Этап/Тип мезоцикла are all edited together from the Мезоциклы row
// below them, since all three live on the same Cycle record — there's no
// sensible way to edit a sub-slice of a merged multi-cycle Период cell
// directly. Микроциклы are edited individually, one cell each.
export function PeriodizationView({ athleteId: _athleteId, cycles: initialCycles, canEdit }: Props) {
  const [cycles, setCycles] = useState(initialCycles)
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null)
  const [editingMicrocycleId, setEditingMicrocycleId] = useState<string | null>(null)
  const toast = useToast()

  const columns = useMemo(() => buildColumns(cycles), [cycles])
  const periodGroups = useMemo(
    () => groupConsecutive(columns, (c) => c.cycle.periodType ?? ''),
    [columns]
  )
  const stageGroups = useMemo(
    () => groupConsecutive(columns, (c) => `${c.cycle.periodType ?? ''}::${c.cycle.stageType ?? ''}`),
    [columns]
  )
  const mesocycleGroups = useMemo(() => groupConsecutive(columns, (c) => c.cycleId), [columns])

  async function patchCycle(cycleId: string, patch: Record<string, string | null>) {
    const previous = cycles
    setCycles((prev) => prev.map((c) => (c.id === cycleId ? { ...c, ...patch } : c)))
    try {
      const res = await fetch(`/api/cycles/${cycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        setCycles(previous)
        const body = await res.json().catch(() => ({}))
        toast({
          title: 'Не удалось сохранить',
          description: body.error ?? 'Ошибка',
          variant: 'error',
        })
      }
    } catch {
      setCycles(previous)
      toast({ title: 'Проблема с сетью — не сохранено', variant: 'error' })
    }
  }

  async function patchMicrocycle(cycleId: string, microcycleId: string, microcycleType: string | null) {
    const previous = cycles
    setCycles((prev) =>
      prev.map((c) =>
        c.id !== cycleId
          ? c
          : {
              ...c,
              microcycles: c.microcycles.map((mc) =>
                mc.id === microcycleId ? { ...mc, microcycleType } : mc
              ),
            }
      )
    )
    try {
      const res = await fetch(`/api/microcycles/${microcycleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ microcycleType }),
      })
      if (!res.ok) {
        setCycles(previous)
        const body = await res.json().catch(() => ({}))
        toast({
          title: 'Не удалось сохранить',
          description: body.error ?? 'Ошибка',
          variant: 'error',
        })
      }
    } catch {
      setCycles(previous)
      toast({ title: 'Проблема с сетью — не сохранено', variant: 'error' })
    }
  }

  return (
    <div className="mx-auto max-w-full space-y-2">
      {canEdit && (
        <p className="text-xs text-text-secondary">
          Период / Этап / Тип мезоцикла задаются вместе — кликни по ячейке в строке «Мезоциклы».
          Тип микроцикла — по ячейке в строке «Микроциклы».
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
        <table className="w-full min-w-max border-collapse text-xs">
          <tbody>
            {/* Дата начала — week numbers + Пн/Вс date range, two lines per cell */}
            <tr className="border-b border-border">
              <RowLabel>Дата начала</RowLabel>
              {columns.map((col, i) => (
                <td
                  key={col.microcycleId}
                  className={`${CELL_W} border-l border-border px-1.5 py-1 text-center align-top`}
                >
                  <div className="font-display text-[11px] text-text-secondary">{i + 1}</div>
                  <div>{dateLabel(col.startDate)}</div>
                  <div>{dateLabel(col.endDate)}</div>
                </td>
              ))}
            </tr>

            {/* Периоды — merged, colored, read-only */}
            <tr className="border-b border-border">
              <RowLabel>Периоды</RowLabel>
              {periodGroups.map((g) => {
                const color = periodColor(g.column.cycle.periodType)
                return (
                  <td
                    key={`period-${g.start}`}
                    colSpan={g.span}
                    className={`border-l border-border px-1.5 py-1.5 text-center font-display font-bold uppercase tracking-wide ${color.bg} ${color.text}`}
                  >
                    {g.column.cycle.periodType || '—'}
                  </td>
                )
              })}
            </tr>

            {/* Этапы — merged, colored by parent период, read-only */}
            <tr className="border-b border-border">
              <RowLabel>Этапы</RowLabel>
              {stageGroups.map((g) => {
                const color = stageColor(g.column.cycle.periodType)
                return (
                  <td
                    key={`stage-${g.start}`}
                    colSpan={g.span}
                    className={`border-l border-border px-1.5 py-1.5 text-center font-medium ${color.bg} ${color.text}`}
                  >
                    {g.column.cycle.stageType || '—'}
                  </td>
                )
              })}
            </tr>

            {/* Мезоциклы — merged by cycle boundary, clickable to edit
                период/этап/тип мезоцикла together */}
            <tr className="border-b border-border">
              <RowLabel>Мезоциклы</RowLabel>
              {mesocycleGroups.map((g) => (
                <td
                  key={`meso-${g.start}`}
                  colSpan={g.span}
                  className="relative border-l border-border px-1.5 py-1.5 text-center align-top"
                >
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingCycleId(editingCycleId === g.column.cycleId ? null : g.column.cycleId)
                      }
                      className="w-full rounded px-1 py-0.5 text-center transition-colors hover:bg-surface-2"
                    >
                      {g.column.cycle.mesocycleType || (
                        <span className="text-text-secondary">не указан</span>
                      )}
                    </button>
                  ) : (
                    g.column.cycle.mesocycleType || <span className="text-text-secondary">—</span>
                  )}
                  {editingCycleId === g.column.cycleId && (
                    <MesocycleEditor
                      cycle={g.column.cycle}
                      onChange={(patch) => patchCycle(g.column.cycleId, patch)}
                      onClose={() => setEditingCycleId(null)}
                    />
                  )}
                </td>
              ))}
            </tr>

            {/* Микроциклы — one cell each, clickable to edit its own type */}
            <tr>
              <RowLabel>Микроциклы</RowLabel>
              {columns.map((col) => (
                <td
                  key={col.microcycleId}
                  className={`${CELL_W} relative border-l border-border px-1.5 py-1.5 text-center align-top`}
                >
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingMicrocycleId(
                          editingMicrocycleId === col.microcycleId ? null : col.microcycleId
                        )
                      }
                      className="w-full rounded px-1 py-0.5 text-center transition-colors hover:bg-surface-2"
                    >
                      {col.microcycleType || <span className="text-text-secondary">—</span>}
                    </button>
                  ) : (
                    col.microcycleType || <span className="text-text-secondary">—</span>
                  )}
                  {editingMicrocycleId === col.microcycleId && (
                    <MicrocycleEditor
                      value={col.microcycleType}
                      onChange={(value) => patchMicrocycle(col.cycleId, col.microcycleId, value)}
                      onClose={() => setEditingMicrocycleId(null)}
                    />
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <td className="sticky left-0 z-10 w-28 min-w-[7rem] bg-surface-2 px-2 py-1.5 text-left font-display text-[11px] font-bold uppercase tracking-wide text-text-secondary">
      {children}
    </td>
  )
}

// Closed dropdown for every periodization tag field — each one (Период,
// Этап, Тип мезоцикла, Тип микроцикла) is a standard, fixed set of
// periodization terms. Saves immediately on change, no separate save step,
// same as AdminExercisesView's "move to block" select.
function PresetSelect({
  label,
  value,
  presets,
  onSave,
}: {
  label: string
  value: string | null
  presets: readonly string[]
  onSave: (next: string | null) => void
}) {
  return (
    <label className="flex flex-col gap-0.5 text-left text-[10px] text-text-secondary">
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => onSave(e.target.value || null)}
        className="rounded border border-border bg-surface px-1.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
      >
        <option value="">не указан</option>
        {presets.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  )
}

// Editing this shifts the whole mesocycle (and every workout day already
// scheduled inside it — see the PATCH route) forward/back together, so the
// week structure stays intact instead of drifting out of sync with the
// dates shown in the "Дата начала" row above.
function DateField({
  label,
  value,
  onSave,
}: {
  label: string
  value: string // ISO
  onSave: (next: string) => void
}) {
  return (
    <label className="flex flex-col gap-0.5 text-left text-[10px] text-text-secondary">
      {label}
      <input
        type="date"
        defaultValue={value.slice(0, 10)}
        onChange={(e) => {
          if (e.target.value) onSave(e.target.value)
        }}
        className="rounded border border-border bg-surface px-1.5 py-1 text-xs text-text-primary outline-none focus:border-accent"
      />
    </label>
  )
}

function MesocycleEditor({
  cycle,
  onChange,
  onClose,
}: {
  cycle: PeriodizationCycle
  onChange: (patch: Record<string, string | null>) => void
  onClose: () => void
}) {
  return (
    <div className="absolute left-0 top-full z-20 mt-1 w-52 space-y-1.5 rounded-lg border border-border bg-surface p-2 text-left shadow-elevated">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-secondary">
          {cycle.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="text-text-secondary hover:text-danger"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <DateField
        label="Дата начала"
        value={cycle.startDate}
        onSave={(v) => onChange({ startDate: v })}
      />
      <PresetSelect
        label="Период"
        value={cycle.periodType}
        presets={PERIOD_PRESETS}
        onSave={(v) => onChange({ periodType: v })}
      />
      <PresetSelect
        label="Этап"
        value={cycle.stageType}
        presets={STAGE_PRESETS}
        onSave={(v) => onChange({ stageType: v })}
      />
      <PresetSelect
        label="Тип мезоцикла"
        value={cycle.mesocycleType}
        presets={MESOCYCLE_PRESETS}
        onSave={(v) => onChange({ mesocycleType: v })}
      />
    </div>
  )
}

function MicrocycleEditor({
  value,
  onChange,
  onClose,
}: {
  value: string | null
  onChange: (value: string | null) => void
  onClose: () => void
}) {
  return (
    <div className="absolute left-0 top-full z-20 mt-1 w-44 space-y-1.5 rounded-lg border border-border bg-surface p-2 text-left shadow-elevated">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="text-text-secondary hover:text-danger"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <PresetSelect
        label="Тип микроцикла"
        value={value}
        presets={MICROCYCLE_PRESETS}
        onSave={onChange}
      />
    </div>
  )
}
