'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'

const WEEKDAY_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

export type GymExportSet = { weight: number; reps: number; toFailure: boolean }
export type GymExportExercise = { id: string; name: string; oneRepMax: number | null; sets: GymExportSet[] }
export type GymExportDay = {
  id: string
  weekNumber: number
  dayNumber: number
  scheduledDate: string | Date
  exercises: GymExportExercise[]
}

type Theme = 'dark' | 'light'

type Props = {
  backHref: string
  backLabel: string
  heading: string
  meta?: string
  clientName: string
  days: GymExportDay[]
  fileName: string
}

function percentOfMax(weight: number, max: number | null): string {
  return max && max > 0 ? `${Math.round((weight / max) * 100)}%` : '—'
}

// Same grouping rule as GymWorkoutEditor's compactSets — consecutive
// identical sets (same weight/reps/toFailure) collapse into one row with a
// ×N count, so this export reads exactly like the app's own compact view.
function compactSets(sets: GymExportSet[]) {
  return sets.reduce<{ weight: number; reps: number; toFailure: boolean; count: number }[]>((groups, set) => {
    const current = groups[groups.length - 1]
    if (current && current.weight === set.weight && current.reps === set.reps && current.toFailure === set.toFailure) {
      current.count += 1
    } else {
      groups.push({ weight: set.weight, reps: set.reps, toFailure: set.toFailure, count: 1 })
    }
    return groups
  }, [])
}

// Read-only mirror of the live gym screens (plan week grid / GymWeekView /
// GymWorkoutEditor's compact mode), laid out for a PDF instead of editing —
// same idea as MicrocycleExportView on the powerlifting side. "Скачать PDF"
// renders the header and each training day to a canvas (html2canvas) and
// drops each onto a portrait A4 page of a jsPDF document, packing multiple
// short days onto the same page rather than one page per day. Used for all
// three gym export scopes (whole plan, one week, one workout) — the caller
// just hands in however many `days` belong to that scope, plus a divider
// heading is inserted automatically whenever the list spans more than one
// week (i.e. a whole-plan export).
export function GymExportView({ backHref, backLabel, heading, meta, clientName, days, fileName }: Props) {
  const [theme, setTheme] = useState<Theme>('dark')
  const isLight = theme === 'light'
  const [generating, setGenerating] = useState(false)

  const headerRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map())

  const multiWeek = new Set(days.map((d) => d.weekNumber)).size > 1

  async function downloadPdf() {
    if (generating) return
    setGenerating(true)
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 10
      const gap = 5
      const maxWidth = pageWidth - margin * 2
      const maxHeight = pageHeight - margin * 2

      const sectionIds = ['header', ...days.flatMap((d) => (multiWeek ? [`week-${d.weekNumber}`, d.id] : [d.id]))]
      // Adjacent duplicate week-divider ids (one inserted per day in a week)
      // collapse to a single instance so each divider is only captured once.
      const orderedIds = sectionIds.filter((id, index) => id === 'header' || id !== sectionIds[index - 1])
      const sections = orderedIds
        .map((id) => (id === 'header' ? headerRef.current : sectionRefs.current.get(id) ?? null))
        .filter((el): el is HTMLElement => el !== null)

      const rootBg = headerRef.current
        ? getComputedStyle(headerRef.current.parentElement ?? headerRef.current).backgroundColor
        : '#ffffff'

      let cursorY = margin
      let pageHasContent = false

      for (const section of sections) {
        const canvas = await html2canvas(section, { scale: 2, backgroundColor: rootBg })
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

      pdf.save(fileName)
    } finally {
      setGenerating(false)
    }
  }

  let lastWeek: number | null = null

  return (
    <div className={`min-h-screen bg-bg text-text-primary theme-${theme}`}>
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
          <div>
            <h1 className="font-display text-lg uppercase tracking-wide">Экспорт: {heading}</h1>
            <p className="text-sm text-text-secondary">Файл сохранится в папку загрузок вашего браузера.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <ToggleSwitch label="Светлая тема" checked={isLight} onChange={(v) => setTheme(v ? 'light' : 'dark')} />
            <button
              type="button"
              onClick={() => void downloadPdf()}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-display font-medium tracking-wide text-on-accent shadow-card transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? 'Готовим PDF...' : 'Скачать PDF'}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10">
        <div ref={headerRef} className="space-y-1 border-b border-border bg-bg p-1 pb-3 text-center">
          <h2 className="font-display text-2xl uppercase tracking-wide">{heading}</h2>
          <p className="text-sm text-text-secondary">{clientName}</p>
          {meta && <p className="text-xs text-text-secondary">{meta}</p>}
        </div>

        {days.map((day) => {
          const date = new Date(day.scheduledDate)
          const weekday = WEEKDAY_FULL[date.getUTCDay()]
          const dateLabel = date.toISOString().slice(0, 10).split('-').reverse().join('.')
          const showDivider = multiWeek && day.weekNumber !== lastWeek
          lastWeek = day.weekNumber

          return (
            <div key={day.id} className="space-y-4">
              {showDivider && (
                <div
                  ref={(el) => {
                    if (el) sectionRefs.current.set(`week-${day.weekNumber}`, el)
                    else sectionRefs.current.delete(`week-${day.weekNumber}`)
                  }}
                  className="bg-bg px-1 py-1"
                >
                  <h3 className="font-display text-base uppercase tracking-wide text-text-secondary">
                    Неделя {day.weekNumber}
                  </h3>
                </div>
              )}

              <section
                ref={(el) => {
                  if (el) sectionRefs.current.set(day.id, el)
                  else sectionRefs.current.delete(day.id)
                }}
                className="rounded-xl border border-border bg-surface"
              >
                <div className="flex items-baseline gap-2 rounded-t-xl border-b border-border bg-accent px-3 py-1.5 text-on-accent">
                  <span className="font-display text-base uppercase tracking-wide">День {day.dayNumber}</span>
                  <span className="text-sm opacity-90">
                    {weekday}, {dateLabel}
                  </span>
                </div>

                {day.exercises.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-text-secondary">Упражнений нет</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
                    {day.exercises.map((exercise, i) => (
                      <div key={exercise.id} className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
                        <h4 className="break-words font-display text-sm uppercase tracking-wide">
                          <span className="mr-1.5 text-text-secondary">{i + 1}.</span>
                          {exercise.name}
                          {exercise.oneRepMax && <span className="ml-1.5 text-xs text-text-secondary">(ПМ {exercise.oneRepMax}кг)</span>}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {compactSets(exercise.sets).map((g, gi) => (
                            <span key={gi} className="rounded border border-border bg-surface px-2 py-1 text-xs">
                              {g.weight} кг {g.count} × {g.toFailure ? 'до отказа' : g.reps}{' '}
                              <span className="text-accent">{percentOfMax(g.weight, exercise.oneRepMax)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )
        })}

        {days.length === 0 && (
          <p className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-text-secondary">
            Тренировок нет
          </p>
        )}
      </div>
    </div>
  )
}

function ToggleSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors ${checked ? 'bg-accent' : 'bg-surface-3'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-card transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </label>
  )
}
