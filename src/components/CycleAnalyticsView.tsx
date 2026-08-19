'use client'

import { useEffect, useMemo, useState } from 'react'
import { Select, Input, Skeleton, Button } from '@/components/ui'
import { MetricsBadge } from './MetricsBadge'
import { CycleWeeklyCharts } from './CycleWeeklyCharts'
import type { CycleAnalytics } from '@/lib/analytics'

type Props = {
  cycleId: string
  totalWeeks: number
}

// Zone coloring reused from MetricsBadge/WeekDayTable for the "Инт.отн" column.
function zoneClass(relativeIntensity: number): string {
  if (relativeIntensity >= 0.95) return 'text-zone-max'
  if (relativeIntensity >= 0.85) return 'text-zone-high'
  if (relativeIntensity >= 0.7) return 'text-zone-moderate'
  return 'text-zone-low'
}

// Cycle-scoped analytics: table + 4 charts of weekly tonnage/КПШ/сред.вес/
// интенсивность across a whole mesocycle, reproducing the source Excel
// per-movement summary sheet. Lets the coach/athlete pick a single exercise
// (e.g. "Приседания") or view all exercises combined, and narrow the week
// range shown — the mesocycle doesn't have to be exactly 12 weeks.
export function CycleAnalyticsView({ cycleId, totalWeeks }: Props) {
  const [data, setData] = useState<CycleAnalytics | null>(null)
  const [exerciseId, setExerciseId] = useState<string>('')
  const [fromWeek, setFromWeek] = useState<number>(1)
  const [toWeek, setToWeek] = useState<number>(totalWeeks || 1)
  // What's actually typed in each box — kept separate from fromWeek/toWeek
  // (the last *valid* value, used for filtering) so the field can sit empty
  // for a moment while retyping instead of the digit being forced back the
  // instant it's deleted. See fromWeekInvalid/toWeekInvalid below for the
  // "can't be less than 1" warning shown while a box is in that state.
  const [fromWeekDraft, setFromWeekDraft] = useState<string>('1')
  const [toWeekDraft, setToWeekDraft] = useState<string>(String(totalWeeks || 1))
  const [rangeTouched, setRangeTouched] = useState(false)

  useEffect(() => {
    const url = exerciseId
      ? `/api/cycles/${cycleId}/analytics?exerciseId=${exerciseId}`
      : `/api/cycles/${cycleId}/analytics`
    fetch(url)
      .then((r) => r.json())
      .then((json: CycleAnalytics) => {
        setData(json)
        if (!rangeTouched && json.weeks.length > 0) {
          const first = json.weeks[0].weekNumber
          const last = json.weeks[json.weeks.length - 1].weekNumber
          setFromWeek(first)
          setToWeek(last)
          setFromWeekDraft(String(first))
          setToWeekDraft(String(last))
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId, exerciseId])

  // A box counts as invalid while it's empty, not a whole number, or below
  // 1 — shown as a warning rather than snapping the digit back immediately,
  // so there's a moment to actually delete "1" and type a new value.
  function isRangeInputInvalid(raw: string): boolean {
    const trimmed = raw.trim()
    if (trimmed === '') return true
    const n = Number(trimmed)
    return !Number.isInteger(n) || n < 1
  }
  const fromWeekInvalid = isRangeInputInvalid(fromWeekDraft)
  const toWeekInvalid = isRangeInputInvalid(toWeekDraft)

  function handleFromWeekChange(raw: string) {
    setRangeTouched(true)
    setFromWeekDraft(raw)
    if (!isRangeInputInvalid(raw)) setFromWeek(Number(raw))
  }
  function handleFromWeekBlur() {
    // Left invalid (empty, 0, a fraction) after all — snap the box back to
    // the last valid value instead of leaving it stuck showing something
    // that was never applied to the table/charts below.
    if (isRangeInputInvalid(fromWeekDraft)) setFromWeekDraft(String(fromWeek))
  }
  function handleToWeekChange(raw: string) {
    setRangeTouched(true)
    setToWeekDraft(raw)
    if (!isRangeInputInvalid(raw)) setToWeek(Number(raw))
  }
  function handleToWeekBlur() {
    if (isRangeInputInvalid(toWeekDraft)) setToWeekDraft(String(toWeek))
  }

  const filteredWeeks = useMemo(() => {
    if (!data) return []
    return data.weeks.filter((w) => w.weekNumber >= fromWeek && w.weekNumber <= toWeek)
  }, [data, fromWeek, toWeek])

  const rangeSummary = useMemo(() => {
    const tonnage = round2(filteredWeeks.reduce((s, w) => s + w.tonnage, 0))
    const kpsh = filteredWeeks.reduce((s, w) => s + w.kpsh, 0)
    const loadCoefficient = round2(filteredWeeks.reduce((s, w) => s + w.loadCoefficient, 0))
    const avgWeight = kpsh > 0 ? round2(tonnage / kpsh) : 0
    const relativeIntensity = kpsh > 0 ? round4(loadCoefficient / kpsh) : 0
    const withFatigue = filteredWeeks.filter((w): w is typeof w & { fatigueIndex: number } => w.fatigueIndex != null)
    const fatigueIndex =
      withFatigue.length > 0
        ? round2(withFatigue.reduce((s, w) => s + w.fatigueIndex, 0) / withFatigue.length)
        : null
    return { tonnage, kpsh, avgWeight, relativeIntensity, loadCoefficient, fatigueIndex }
  }, [filteredWeeks])

  function resetRange() {
    if (!data || data.weeks.length === 0) return
    setRangeTouched(false)
    const first = data.weeks[0].weekNumber
    const last = data.weeks[data.weeks.length - 1].weekNumber
    setFromWeek(first)
    setToWeek(last)
    setFromWeekDraft(String(first))
    setToWeekDraft(String(last))
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs text-text-secondary">Упражнение</label>
          <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
            <option value="">Все упражнения</option>
            {data.exercises.map((ex) => (
              <option key={ex.exerciseId} value={ex.exerciseId}>
                {ex.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-text-secondary">С микроцикла</label>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={fromWeekDraft}
            onChange={(e) => handleFromWeekChange(e.target.value)}
            onBlur={handleFromWeekBlur}
            aria-invalid={fromWeekInvalid}
          />
          {fromWeekInvalid && (
            <p className="mt-1 w-32 text-xs text-danger">Не может быть меньше 1</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-secondary">По микроцикл</label>
          <Input
            type="number"
            min={1}
            className="w-20"
            value={toWeekDraft}
            onChange={(e) => handleToWeekChange(e.target.value)}
            onBlur={handleToWeekBlur}
            aria-invalid={toWeekInvalid}
          />
          {toWeekInvalid && (
            <p className="mt-1 w-32 text-xs text-danger">Не может быть меньше 1</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={resetRange}>
          Сбросить диапазон
        </Button>
      </div>

      {filteredWeeks.length > 0 && (
        <MetricsBadge
          tonnage={rangeSummary.tonnage}
          kpsh={rangeSummary.kpsh}
          avgWeight={rangeSummary.avgWeight}
          relativeIntensity={rangeSummary.relativeIntensity}
          loadCoefficient={rangeSummary.loadCoefficient}
          fatigueIndex={rangeSummary.fatigueIndex}
        />
      )}

      {filteredWeeks.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Нет тренировок {exerciseId ? 'по этому упражнению' : ''} за выбранный диапазон микроциклов.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-3 py-2 text-left">Микроцикл</th>
                <th className="px-3 py-2 text-right">Тоннаж</th>
                <th className="px-3 py-2 text-right">Сред.вес</th>
                <th className="px-3 py-2 text-right">Инт.отн</th>
                <th className="px-3 py-2 text-right">КПШ</th>
                <th className="px-3 py-2 text-right">КО</th>
              </tr>
            </thead>
            <tbody>
              {filteredWeeks.map((w) => (
                <tr key={w.microcycleId} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5 font-display tracking-wide">{w.weekNumber}</td>
                  <td className="px-3 py-1.5 text-right">{w.tonnage}</td>
                  <td className="px-3 py-1.5 text-right">{w.avgWeight}</td>
                  <td className={`px-3 py-1.5 text-right ${zoneClass(w.relativeIntensity)}`}>
                    {Math.round(w.relativeIntensity * 100)}%
                  </td>
                  <td className="px-3 py-1.5 text-right">{w.kpsh}</td>
                  <td className="px-3 py-1.5 text-right">{w.loadCoefficient}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CycleWeeklyCharts weeks={filteredWeeks} />
    </div>
  )
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}
