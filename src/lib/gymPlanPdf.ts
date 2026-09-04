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
// Single-microcycle export (see buildGymWeekPdf) — same workouts a full
// plan export would show for that week, plus enough plan/client context
// for the PDF to stand alone.
export type PdfWeekExport = {
  planName: string
  clientName: string
  weekNumber: number
  workouts: PdfWorkout[]
}
// Single-workout export (see buildGymWorkoutPdf).
export type PdfWorkoutExport = {
  planName: string
  clientName: string
  weekNumber: number
  workout: PdfWorkout
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

// Shared setup for every gym PDF export (plan, week, or single workout):
// embeds the Unicode font (jsPDF's built-ins can't render Cyrillic) and
// tracks the current vertical cursor with page-break handling, so
// buildGymPlanPdf/buildGymWeekPdf/buildGymWorkoutPdf only need to describe
// what to draw, not how pagination works.
type PdfCtx = {
  doc: jsPDF
  ensureSpace: (lines: number, lineHeight: number) => void
  heading: (text: string, size: number, gapAfter: number) => void
}

function createPdfContext(): PdfCtx {
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

  return {
    doc,
    ensureSpace,
    heading,
    get y() {
      return y
    },
    set y(value: number) {
      y = value
    },
  } as PdfCtx & { y: number }
}

// Draws one exercise's name (+ 1RM label) and its sets, wrapping onto
// further lines as needed. Shared by the plan/week/workout exports below.
function drawExercise(ctx: PdfCtx & { y: number }, exercise: PdfExercise, indent: number) {
  const { doc } = ctx
  const setsText = formatSets(exercise.sets)
  const wrapped = doc.splitTextToSize(setsText, CONTENT_WIDTH - indent + MARGIN - 2)
  ctx.ensureSpace(1 + wrapped.length, 4.6)

  doc.setFont('DejaVuSans', 'bold')
  doc.setFontSize(9.5)
  const maxLabel = exercise.oneRepMax ? `  (ПМ ${exercise.oneRepMax}кг)` : ''
  doc.text(`${exercise.name}${maxLabel}`, indent, ctx.y)
  ctx.y += 4.4

  doc.setFont('DejaVuSans', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(70)
  for (const line of wrapped as string[]) {
    ctx.ensureSpace(1, 4.2)
    doc.text(line, indent + 2, ctx.y)
    ctx.y += 4.2
  }
  doc.setTextColor(0)
}

// Draws one training day's heading ("День N · дата") and its exercises.
function drawWorkout(ctx: PdfCtx & { y: number }, workout: PdfWorkout, indent: number) {
  const { doc } = ctx
  ctx.ensureSpace(1, 6)
  doc.setFont('DejaVuSans', 'bold')
  doc.setFontSize(11)
  doc.text(`День ${workout.dayNumber} · ${formatDate(workout.scheduledDate)}`, indent, ctx.y)
  ctx.y += 5.5

  if (!workout.exercises.length) {
    doc.setFont('DejaVuSans', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(120)
    ctx.ensureSpace(1, 5)
    doc.text('Упражнений нет', indent + 3, ctx.y)
    doc.setTextColor(0)
    ctx.y += 5
    return
  }

  for (const exercise of workout.exercises) {
    drawExercise(ctx, exercise, indent + 3)
  }
  ctx.y += 2
}

function drawSubtitle(ctx: PdfCtx & { y: number }, text: string) {
  const { doc } = ctx
  doc.setFont('DejaVuSans', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(text, MARGIN, ctx.y)
  doc.setTextColor(0)
  ctx.y += 8
}

// Server-side (no DOM/canvas needed) PDF export for a whole gym plan —
// every week, training day, exercise and set, one continuous flowing
// document with page breaks as needed. Unlike MicrocycleExportView (which
// rasterises the live week UI via html2canvas for a single microcycle),
// this draws plain vector text for the entire plan at once, so it needs a
// Unicode-capable font embedded up front (see fonts/dejaVuSansBase64.ts) —
// jsPDF's built-in fonts can't render Cyrillic.
export function buildGymPlanPdf(plan: PdfPlan): Buffer {
  const ctx = createPdfContext() as PdfCtx & { y: number }
  const { doc } = ctx

  ctx.heading(plan.name, 18, 4)
  drawSubtitle(ctx, `${plan.clientName} · начало ${plan.startDate.toISOString().slice(0, 10)} · ${plan.weeks.length} нед.`)

  for (const week of plan.weeks) {
    ctx.heading(`Неделя ${week.weekNumber}`, 13, 2)

    if (!week.workouts.length) {
      doc.setFont('DejaVuSans', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(120)
      ctx.ensureSpace(1, 5)
      doc.text('Тренировок нет', MARGIN + 2, ctx.y)
      doc.setTextColor(0)
      ctx.y += 6
      continue
    }

    for (const workout of week.workouts) {
      drawWorkout(ctx, workout, MARGIN + 2)
    }
    ctx.y += 2
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// PDF export for a single microcycle (week) — its own document instead of
// having to export (or scroll through) the whole plan just to hand an
// athlete or print one week's training days.
export function buildGymWeekPdf(week: PdfWeekExport): Buffer {
  const ctx = createPdfContext() as PdfCtx & { y: number }
  const { doc } = ctx

  ctx.heading(`${week.planName} — неделя ${week.weekNumber}`, 16, 4)
  drawSubtitle(ctx, week.clientName)

  if (!week.workouts.length) {
    doc.setFont('DejaVuSans', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(120)
    ctx.ensureSpace(1, 5)
    doc.text('Тренировок нет', MARGIN, ctx.y)
    doc.setTextColor(0)
  } else {
    for (const workout of week.workouts) {
      drawWorkout(ctx, workout, MARGIN)
    }
  }

  return Buffer.from(doc.output('arraybuffer'))
}

// PDF export for a single training day — the smallest unit a client would
// want printed or saved on its own (e.g. to bring to the gym).
export function buildGymWorkoutPdf(data: PdfWorkoutExport): Buffer {
  const ctx = createPdfContext() as PdfCtx & { y: number }
  const { doc } = ctx

  ctx.heading(
    `${data.planName} — неделя ${data.weekNumber}, день ${data.workout.dayNumber}`,
    16,
    4
  )
  drawSubtitle(ctx, `${data.clientName} · ${formatDate(data.workout.scheduledDate)}`)

  if (!data.workout.exercises.length) {
    doc.setFont('DejaVuSans', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(120)
    ctx.ensureSpace(1, 5)
    doc.text('Упражнений нет', MARGIN, ctx.y)
    doc.setTextColor(0)
  } else {
    for (const exercise of data.workout.exercises) {
      drawExercise(ctx, exercise, MARGIN)
    }
  }

  return Buffer.from(doc.output('arraybuffer'))
}
