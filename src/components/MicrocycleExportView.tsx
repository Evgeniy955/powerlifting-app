'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { computeExerciseMetrics, aggregateMetrics, type ExerciseMetrics } from '@/lib/metrics'
import { isTrainingGroup, trainingGroupColor } from '@/lib/trainingGroups'
import type { RpePoint } from '@/lib/rpe'
import type { WeekWorkoutData } from './WeekDayTable'

const WEEKDAY_FULL = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
]

function zoneClass(relativeIntensity: number): string {
  if (relativeIntensity >= 0.95) return 'text-zone-max'
  if (relativeIntensity >= 0.85) return 'text-zone-high'
  if (relativeIntensity >= 0.7) return 'text-zone-moderate'
  return 'text-zone-low'
}

// "80×5, 85×5, 90×3" — a print-friendly stand-in for the live table's one
// input-pair-per-set columns. No point reproducing editable weight/reps
// boxes on paper; a compact comma list reads faster and doesn't force the
// page to be as wide as the max number of sets logged all week.
function formatSets(sets: { weight: number; reps: number }[]): string {
  if (sets.length === 0) return '—'
  return sets.map((s) => `${s.weight}×${s.reps}`).join(', ')
}

type Props = {
  cycleId: string
  cycleName: string
  weekNumber: number
  athleteName: string | null
  workouts: WeekWorkoutData[]
  rpeTable: RpePoint[]
}

type Theme = 'dark' | 'light'

// Read-only, print-oriented mirror of MicrocycleWeekView — same data, laid
// out for paper instead of editing. No lock state, drag-to-reorder, inline
// editors or autocompletes; every exercise entry is a plain row. Turned into
// an actual PDF via the browser's own "Print > Save as PDF", triggered by
// the "Печать / Сохранить PDF" button below, rather than a server-rendered
// file — keeps the export pixel-identical to what's on screen without a
// second rendering pipeline (headless Chrome, a PDF library, ...) to keep in
// sync with the live week view.
export function MicrocycleExportView({
  cycleId,
  cycleName,
  weekNumber,
  athleteName,
  workouts,
  rpeTable,
}: Props) {
  // Defaults to dark — the app's own default theme — so a coach exporting
  // straight from the dark UI gets a matching PDF unless they deliberately
  // flip the slider for a lighter, more ink-friendly printout.
  const [theme, setTheme] = useState<Theme>('dark')
  const isLight = theme === 'light'

  const perWorkout = useMemo(
    () =>
      workouts.map((workout) => {
        const metricsByEntry = new Map<string, ExerciseMetrics>(
          workout.exerciseEntries.map((e) => [
            e.id,
            computeExerciseMetrics(
              {
                sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
                oneRepMax: e.oneRepMax ?? 0,
                impactCoefficient: e.exercise.impactCoefficient,
                multiplier: e.multiplier,
              },
              rpeTable
            ),
          ])
        )

        const loadMetrics = workout.exerciseEntries
          .filter((e) => e.exercise.trainingGroup === 'BASE' || e.exercise.trainingGroup === 'SPP')
          .map((e) => metricsByEntry.get(e.id)!)
        const allMetrics = Array.from(metricsByEntry.values())
        const loadTotals = aggregateMetrics(loadMetrics)
        const allTotals = aggregateMetrics(allMetrics)

        const dayTotals = {
          tonnage: loadTotals.tonnage,
          avgWeight: loadTotals.avgWeight,
          relativeIntensity: loadTotals.relativeIntensity,
          kpsh: allTotals.kpsh,
          loadCoefficient: allTotals.loadCoefficient,
        }

        // Split into two print columns: first half left, remainder right —
        // e.g. 5 exercises -> 3 left / 2 right, instead of one long column
        // running the full height of the page.
        const half = Math.ceil(workout.exerciseEntries.length / 2)
        const columns = [workout.exerciseEntries.slice(0, half), workout.exerciseEntries.slice(half)]

        return { workout, metricsByEntry, dayTotals, columns }
      }),
    [workouts, rpeTable]
  )

  const weekTotals = useMemo(() => {
    const all = perWorkout.flatMap(({ workout, metricsByEntry }) =>
      workout.exerciseEntries.map((e) => metricsByEntry.get(e.id)!)
    )
    return all.length > 0 ? aggregateMetrics(all) : null
  }, [perWorkout])

  return (
    <div className={`min-h-screen bg-bg text-text-primary theme-${theme}`}>
      {/* Everything in here is hidden in the print stylesheet (see
          .no-print in globals.css) — controls for building the document,
          not part of it. */}
      <div className="no-print mx-auto max-w-5xl space-y-4 px-4 py-6">
        <Link
          href={`/cycles/${cycleId}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> {cycleName}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <div>
            <h1 className="font-display text-lg uppercase tracking-wide">
              Экспорт: Микроцикл {weekNumber}
            </h1>
            <p className="text-sm text-text-secondary">
              Откроется системный диалог печати — выберите «Сохранить как PDF».
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              Светлая тема
              <button
                type="button"
                role="switch"
                aria-checked={isLight}
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors ${
                  isLight ? 'bg-accent' : 'bg-surface-3'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-card transition-transform ${
                    isLight ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-display font-medium tracking-wide text-on-accent shadow-card transition hover:brightness-110"
            >
              <Printer className="h-4 w-4" /> Печать / Сохранить PDF
            </button>
          </div>
        </div>
      </div>

      {/* Printable area. */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-10">
        <header className="space-y-1 border-b border-border pb-3 text-center">
          <p className="text-sm text-text-secondary">{cycleName}</p>
          <h2 className="font-display text-2xl uppercase tracking-wide">Микроцикл {weekNumber}</h2>
          {athleteName && <p className="text-sm text-text-secondary">{athleteName}</p>}
        </header>

        {weekTotals && (
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm sm:grid-cols-6">
            <Metric label="Тоннаж" value={`${weekTotals.tonnage} кг`} />
            <Metric label="КПШ" value={String(weekTotals.kpsh)} />
            <Metric label="Сред.вес" value={`${weekTotals.avgWeight} кг`} />
            <Metric
              label="Интенсивность"
              value={`${Math.round(weekTotals.relativeIntensity * 100)}%`}
              valueClassName={zoneClass(weekTotals.relativeIntensity)}
            />
            <Metric label="КО" value={String(weekTotals.loadCoefficient)} />
            <Metric label="Инд. усталости" value={weekTotals.fatigueIndex ?? '—'} />
          </div>
        )}

        {perWorkout.map(({ workout, metricsByEntry, dayTotals, columns }, dayIndex) => {
          const date = new Date(workout.scheduledDate)
          const weekday = WEEKDAY_FULL[date.getUTCDay()]
          const dateLabel = date.toISOString().slice(0, 10).split('-').reverse().join('.')

          return (
            <section
              key={workout.id}
              className={`export-day break-inside-avoid rounded-xl border border-border bg-surface ${
                dayIndex > 0 ? 'break-before-page' : ''
              }`}
            >
              <div className="flex items-baseline gap-2 rounded-t-xl border-b border-border bg-accent px-3 py-1.5 text-on-accent">
                <span className="font-display text-base uppercase tracking-wide">{weekday}</span>
                <span className="text-sm opacity-90">{dateLabel}</span>
              </div>

              {workout.exerciseEntries.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-text-secondary">
                  Нет упражнений
                </p>
              ) : (
                <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
                  {columns.map((column, colIndex) => (
                    <ExerciseColumn
                      key={colIndex}
                      entries={column}
                      startIndex={colIndex === 0 ? 0 : columns[0].length}
                      metricsByEntry={metricsByEntry}
                    />
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 rounded-b-xl border-t border-border bg-surface-2 px-3 py-1.5 text-xs font-medium">
                <span className="mr-auto text-text-secondary">Итого за день</span>
                <span>
                  Тонн: <span className="text-text-primary">{dayTotals.tonnage}</span>
                </span>
                <span>
                  Срвес: <span className="text-text-primary">{dayTotals.avgWeight}</span>
                </span>
                <span className={zoneClass(dayTotals.relativeIntensity)}>
                  Инт%: {Math.round(dayTotals.relativeIntensity * 100)}%
                </span>
                <span>
                  КПШ: <span className="text-text-primary">{dayTotals.kpsh}</span>
                </span>
                <span>
                  КО: <span className="text-text-primary">{dayTotals.loadCoefficient}</span>
                </span>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  valueClassName = '',
}: {
  label: string
  value: string | number
  valueClassName?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-display tracking-wide ${valueClassName}`}>{value}</span>
    </div>
  )
}

function ExerciseColumn({
  entries,
  startIndex,
  metricsByEntry,
}: {
  entries: WeekWorkoutData['exerciseEntries']
  startIndex: number
  metricsByEntry: Map<string, ExerciseMetrics>
}) {
  if (entries.length === 0) return <div />

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-surface-2 text-left text-text-secondary">
          <th className="px-2 py-1 font-bold">Упражнение</th>
          <th className="px-2 py-1 font-bold">Подходы</th>
          <th className="px-1.5 py-1 text-right font-bold">Тонн</th>
          <th className="px-1.5 py-1 text-right font-bold">Инт%</th>
          <th className="px-1.5 py-1 text-right font-bold">ПМ</th>
          <th className="px-1.5 py-1 text-right font-bold">КО</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => {
          const m = metricsByEntry.get(entry.id)!
          return (
            <tr key={entry.id} className={`border-b border-border last:border-b-0 ${entry.skipped ? 'opacity-50' : ''}`}>
              <td className="max-w-[9rem] px-2 py-1 align-top font-medium">
                {isTrainingGroup(entry.exercise.trainingGroup) && (
                  <span
                    className={`mr-1 inline-block h-2 w-2 shrink-0 rounded-full align-middle ${trainingGroupColor(entry.exercise.trainingGroup).dot}`}
                  />
                )}
                <span className="text-text-secondary">{startIndex + i + 1}. </span>
                <span className={entry.skipped ? 'line-through' : ''}>{entry.exercise.name}</span>
                {entry.multiplier !== 1 && (
                  <span className="ml-1 text-text-secondary">×{entry.multiplier}</span>
                )}
              </td>
              <td className="px-2 py-1 align-top text-text-secondary">
                {formatSets(entry.sets)}
              </td>
              <td className="px-1.5 py-1 text-right align-top">{m.tonnage}</td>
              <td className={`px-1.5 py-1 text-right align-top ${zoneClass(m.relativeIntensity)}`}>
                {Math.round(m.relativeIntensity * 100)}%
              </td>
              <td className="px-1.5 py-1 text-right align-top font-bold">
                {entry.oneRepMax ?? '—'}
              </td>
              <td className="px-1.5 py-1 text-right align-top">{m.loadCoefficient}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
