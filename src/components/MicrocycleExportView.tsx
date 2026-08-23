'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import { computeExerciseMetrics, aggregateMetrics, type ExerciseMetrics } from '@/lib/metrics'
import { isTrainingGroup, trainingGroupColor } from '@/lib/trainingGroups'
import { groupSets } from '@/lib/setGrouping'
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

// Read-only mirror of MicrocycleWeekView — same data, laid out for a PDF
// instead of editing. No lock state, drag-to-reorder, inline editors or
// autocompletes; every exercise entry is a plain row. "Скачать PDF" renders
// the header block and each day's card to a canvas (html2canvas) and drops
// each one onto its own landscape A4 page of a jsPDF document, which is then
// saved straight to disk — no print dialog, no intermediate "Print" step.
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
  const [generating, setGenerating] = useState(false)

  // Default both on regardless of the account's own saved preference — the
  // compact card-grid PDF is what most people want to hand an athlete or
  // print out; either toggle can still be flipped off before downloading.
  const [simplified, setSimplified] = useState(true)
  const [compact, setCompact] = useState(true)
  // Matches ExerciseCard/WorkoutView's own rule: the grouped-sets "compact"
  // card grid only replaces the per-exercise table once simplified is also
  // on — compact-alone or simplified-alone still fall through to the
  // detailed 2-column table below, just as today.
  const compactSimplified = simplified && compact

  // One ref for the title/summary block, one per day card — html2canvas
  // renders each of these separately so every section lands on its own PDF
  // page instead of one giant screenshot getting sliced at arbitrary
  // pixel boundaries (which could cut a table row in half).
  const headerRef = useRef<HTMLDivElement>(null)
  const dayRefs = useRef<Map<string, HTMLElement>>(new Map())

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

  async function downloadPdf() {
    if (generating) return
    setGenerating(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const gap = 6
      const maxWidth = pageWidth - margin * 2
      const maxHeight = pageHeight - margin * 2

      const sections = [headerRef.current, ...workouts.map((w) => dayRefs.current.get(w.id) ?? null)].filter(
        (el): el is HTMLElement => el !== null
      )

      // Same background for every capture — otherwise a section whose own
      // wrapper has no explicit bg (just inherits the page's) renders onto
      // html2canvas's default white canvas, which reads as a stray white
      // block on a dark-theme PDF page.
      const rootBg = headerRef.current
        ? getComputedStyle(headerRef.current.parentElement ?? headerRef.current).backgroundColor
        : '#ffffff'

      // Pack sections down the page instead of giving each one its own —
      // a short day (one row of compact cards) is nowhere near a full A4
      // page tall, so forcing a page break after every section left most of
      // each page blank. Only start a new page once the next section
      // genuinely doesn't fit under whatever's already been placed.
      let cursorY = margin
      let pageHasContent = false

      for (let i = 0; i < sections.length; i++) {
        const canvas = await html2canvas(sections[i], { scale: 2, backgroundColor: rootBg })
        const imgData = canvas.toDataURL('image/png')

        let renderWidth = maxWidth
        let renderHeight = (canvas.height * renderWidth) / canvas.width
        if (renderHeight > maxHeight) {
          renderHeight = maxHeight
          renderWidth = (canvas.width * renderHeight) / canvas.height
        }

        if (pageHasContent && cursorY + renderHeight > margin + maxHeight) {
          pdf.addPage()
          cursorY = margin
          pageHasContent = false
        }

        pdf.addImage(imgData, 'PNG', margin, cursorY, renderWidth, renderHeight)
        cursorY += renderHeight + gap
        pageHasContent = true
      }

      pdf.save(`Микроцикл ${weekNumber}.pdf`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={`min-h-screen bg-bg text-text-primary theme-${theme}`}>
      {/* Controls for building the file — not part of the PDF itself, since
          downloadPdf only ever captures headerRef/dayRefs below. */}
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
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
              Файл сохранится в папку загрузок вашего браузера.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <ToggleSwitch label="Упрощённый режим" checked={simplified} onChange={setSimplified} />
            <ToggleSwitch label="Компактный режим" checked={compact} onChange={setCompact} />
            <ToggleSwitch label="Светлая тема" checked={isLight} onChange={(v) => setTheme(v ? 'light' : 'dark')} />

            <button
              type="button"
              onClick={downloadPdf}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-display font-medium tracking-wide text-on-accent shadow-card transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {generating ? 'Готовим PDF...' : 'Скачать PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Exported area — only headerRef and each dayRefs entry are actually
          captured into the PDF; the wrapping div itself is just layout. */}
      <div className="mx-auto max-w-6xl space-y-6 px-4 pb-10">
        <div ref={headerRef} className="space-y-6 bg-bg p-1">
          <header className="space-y-1 border-b border-border pb-3 text-center">
            <p className="text-sm text-text-secondary">{cycleName}</p>
            <h2 className="font-display text-2xl uppercase tracking-wide">Микроцикл {weekNumber}</h2>
            {athleteName && <p className="text-sm text-text-secondary">{athleteName}</p>}
          </header>

          {weekTotals && !simplified && (
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
        </div>

        {perWorkout.map(({ workout, metricsByEntry, dayTotals, columns }) => {
          const date = new Date(workout.scheduledDate)
          const weekday = WEEKDAY_FULL[date.getUTCDay()]
          const dateLabel = date.toISOString().slice(0, 10).split('-').reverse().join('.')

          return (
            <section
              key={workout.id}
              ref={(el) => {
                if (el) dayRefs.current.set(workout.id, el)
                else dayRefs.current.delete(workout.id)
              }}
              className="rounded-xl border border-border bg-surface"
            >
              <div className="flex items-baseline gap-2 rounded-t-xl border-b border-border bg-accent px-3 py-1.5 text-on-accent">
                <span className="font-display text-base uppercase tracking-wide">{weekday}</span>
                <span className="text-sm opacity-90">{dateLabel}</span>
              </div>

              {workout.exerciseEntries.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-text-secondary">
                  Нет упражнений
                </p>
              ) : compactSimplified ? (
                <CompactExerciseGrid entries={workout.exerciseEntries} />
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

              {!simplified && (
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
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-card transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  )
}

// Mirrors ExerciseCard's own compact+simplified rendering (name + groupSets
// rows, no icons/badges/MetricsBadge) in a 3-across grid, same as the
// desktop Workout-view card layout (WorkoutView's lg:grid-cols-2
// xl:grid-cols-3) — this is the layout the coach/athlete already recognizes
// from that screen, just reproduced read-only for the PDF.
function CompactExerciseGrid({ entries }: { entries: WeekWorkoutData['exerciseEntries'] }) {
  return (
    <div className="grid grid-cols-3 gap-3 p-3">
      {entries.map((entry, i) => {
        const groups = groupSets(entry.sets, entry.oneRepMax)
        return (
          <div
            key={entry.id}
            className={`space-y-2 rounded-xl border border-border bg-surface p-3 ${entry.skipped ? 'opacity-60' : ''}`}
          >
            <h3
              className={`break-words font-display text-base uppercase tracking-wide ${entry.skipped ? 'line-through' : ''}`}
            >
              <span className="mr-1.5 text-text-secondary">{i + 1}.</span>
              {entry.exercise.name}
            </h3>
            <div className="space-y-1 text-sm">
              {groups.length === 0 ? (
                <p className="text-text-secondary">Нет подходов</p>
              ) : (
                groups.map((g, gi) => (
                  <div key={gi} className="flex items-center gap-3">
                    <span className="w-16 text-right font-bold text-accent">{g.weight}кг</span>
                    <span className="w-12 text-text-secondary">
                      {g.count}×{g.reps}
                    </span>
                    <span className="w-12 text-right text-text-secondary">
                      {g.percentOf1rm !== null ? `${Math.round(g.percentOf1rm * 100)}%` : '—'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
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
