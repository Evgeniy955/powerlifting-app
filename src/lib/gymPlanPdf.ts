import { jsPDF } from 'jspdf'
import { DEJAVU_SANS_REGULAR_BASE64, DEJAVU_SANS_BOLD_BASE64 } from '@/lib/fonts/dejaVuSansBase64'

export type PdfSet = { setNumber: number; weight: number; reps: number; toFailure: boolean }
export type PdfExercise = { name: string; oneRepMax: number | null; sets: PdfSet[] }
export type PdfWorkout = { dayNumber: number; scheduledDate: Date; exercises: PdfExercise[] }
export type PdfWeek = { weekNumber: number; workouts: PdfWorkout[] }
export type PdfPlan = {
  name: string
  clientName: string
  startDate: Date
  weeks: PdfWeek[]
}

const WEEKDAY_NAMES = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function formatDate(date: Date): string {
  return `${WEEKDAY_NAMES[date.getUTCDay()]} ${date.toISOString().slice(0, 10)}`
}

// "80×5, 85×5, 90×5" — collapses consecutive identical sets ("×4" instead of
// four separate entries), matching how the app already displays compact-mode
// sets elsewhere (see GymWorkoutEditor's compactSets).
function formatSets(sets: PdfSet[]): string {
  if (!sets.length) return '—'
  const groups: { weight: number; reps: number; toFailure: boolean; count: number }[] = []
  for (const set of sets) {
    const last = groups[groups.length - 1]
    if (last && last.weight === set.weight && last.reps === set.reps && last.toFailure === set.toFailure) last.count += 1
    else groups.push({ weight: set.weight, reps: set.reps, toFailure: set.toFailure, count: 1 })
  }
  return groups
    .map((g) => {
      const repsLabel = g.toFailure ? 'до отказа' : String(g.reps)
      return (g.weight > 0 ? `${g.weight}кг×${repsLabel}` : `×${repsLabel}`) + (g.count > 1 ? ` (×${g.count})` : '')
    })
    .join(', ')
}

const PAGE_WIDTH = 210 // A4 portrait, mm
const MARGIN = 14
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const PAGE_HEIGHT = 297

// Server-side (no DOM/canvas needed) PDF export for a whole gym plan —
// every week, training day, exercise and set, one continuous flowing
// document with page breaks as needed. Unlike MicrocycleExportView (which
// rasterises the live week UI via html2canvas for a single microcycle),
// this draws plain vector text for the entire plan at once, so it needs a
// Unicode-capable font embedded up front (see fonts/dejaVuSansBase64.ts) —
// jsPDF's built-in fonts can't render Cyrillic.
export function buildGymPlanPdf(plan: PdfPlan): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_REGULAR_BASE64)
  doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal')
  doc.addFileToVFS('DejaVuSans-Bold.ttf', DEJAVU_SANS_BOLD_BASE64)
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold')

  let y = MARGIN

  function ensureSpace(lines: number, lineHeight: number) {
    if (y + lines * lineHeight > PAGE_HEIGHT - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }

  function heading(text: string, size: number, gapAfter: number) {
    ensureSpace(1, size / 2)
    doc.setFont('DejaVuSans', 'bold')
    doc.setFontSize(size)
    doc.text(text, MARGIN, y)
    y += size / 2.2 + gapAfter
  }

  heading(plan.name, 18, 4)
  doc.setFont('DejaVuSans', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(`${plan.clientName} · начало ${plan.startDate.toISOString().slice(0, 10)} · ${plan.weeks.length} нед.`, MARGIN, y)
  doc.setTextColor(0)
  y += 8

  for (const week of plan.weeks) {
    heading(`Неделя ${week.weekNumber}`, 13, 2)

    if (!week.workouts.length) {
      doc.setFont('DejaVuSans', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(120)
      ensureSpace(1, 5)
      doc.text('Тренировок нет', MARGIN + 2, y)
      doc.setTextColor(0)
      y += 6
      continue
    }

    for (const workout of week.workouts) {
      ensureSpace(1, 6)
      doc.setFont('DejaVuSans', 'bold')
      doc.setFontSize(11)
      doc.text(`День ${workout.dayNumber} · ${formatDate(workout.scheduledDate)}`, MARGIN + 2, y)
      y += 5.5

      if (!workout.exercises.length) {
        doc.setFont('DejaVuSans', 'normal')
        doc.setFontSize(9.5)
        doc.setTextColor(120)
        ensureSpace(1, 5)
        doc.text('Упражнений нет', MARGIN + 5, y)
        doc.setTextColor(0)
        y += 5
        continue
      }

      for (const exercise of workout.exercises) {
        const setsText = formatSets(exercise.sets)
        const wrapped = doc.splitTextToSize(setsText, CONTENT_WIDTH - 10)
        ensureSpace(1 + wrapped.length, 4.6)

        doc.setFont('DejaVuSans', 'bold')
        doc.setFontSize(9.5)
        const maxLabel = exercise.oneRepMax ? `  (ПМ ${exercise.oneRepMax}кг)` : ''
        doc.text(`${exercise.name}${maxLabel}`, MARGIN + 5, y)
        y += 4.4

        doc.setFont('DejaVuSans', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(70)
        for (const line of wrapped as string[]) {
          ensureSpace(1, 4.2)
          doc.text(line, MARGIN + 7, y)
          y += 4.2
        }
        doc.setTextColor(0)
      }
      y += 2
    }
    y += 2
  }

  return Buffer.from(doc.output('arraybuffer'))
}
