import ExcelJS from 'exceljs'
import { prisma } from './prisma'
import { computeExerciseMetrics, aggregateMetrics, type ExerciseMetrics } from './metrics'
import type { RpePoint } from './rpe'

// Colors lifted straight from the original Excel workbook this app replaced
// (sheet "1 в день") — the coach explicitly asked the export to keep that
// look, not the app's own web theme.
const NAVY = 'FF002060' // Микроцикл title bar
const BLUE_HEADER = 'FF0070C0' // column header row
const RED = 'FFFF0000' // weekday badge
const YELLOW = 'FFFFFF00' // "Приседания" (squat-pattern) row highlight
const GREEN = 'FF00B050' // "Жим" (press-pattern) row highlight
const DEFAULT_ROW = 'FF95B3D7' // everything else — the workbook's default
// light-blue row tint (Excel theme Accent1 lightened 40%, resolved to a
// fixed RGB since ExcelJS has no theme-color API)
const WHITE = 'FFFFFFFF'
const TOTAL_TEXT = 'FF3F3F3F'

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

function safeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no []:*?/\\
  return name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'План'
}

// The original spreadsheet doesn't have one column per logged set — it
// collapses a run of consecutive identical (weight×reps) sets into a single
// "Вес/Под/Пов" group with Под = how many. A 5x5 program is 1 group, not 5;
// this is what keeps that sheet's set-columns to a handful instead of one
// per set. Empty (never filled in) sets are dropped, same convention as the
// rest of the app (e.g. ExerciseCard's setsText).
type SetGroup = { weight: number; reps: number; count: number }
function groupSets(sets: { weight: number; reps: number }[]): SetGroup[] {
  const groups: SetGroup[] = []
  for (const s of sets) {
    if (!(s.weight > 0 && s.reps > 0)) continue
    const last = groups[groups.length - 1]
    if (last && last.weight === s.weight && last.reps === s.reps) {
      last.count += 1
    } else {
      groups.push({ weight: s.weight, reps: s.reps, count: 1 })
    }
  }
  return groups
}

// The original file color-codes each exercise row by movement pattern
// (ExerciseCatalog.category — free text, e.g. "Присед"/"Жим"/"Тяга"), not by
// the app's own BASE/SPP/GPP training-block axis: every squat variant is
// yellow, every press variant is green, everything else (deadlifts,
// accessory work, unclassified) gets the sheet's default blue. Matched
// loosely (substring, case-insensitive) since it's coach-entered free text —
// this app's own seed data uses "Присед", not the longer "Приседания".
function isSquatCategory(category: string | null): boolean {
  return (category?.toLowerCase() ?? '').includes('присед')
}
function isPressCategory(category: string | null): boolean {
  return (category?.toLowerCase() ?? '').includes('жим')
}
function categoryFill(category: string | null): string {
  if (isSquatCategory(category)) return YELLOW
  if (isPressCategory(category)) return GREEN
  return DEFAULT_ROW
}

function headerCell(row: ExcelJS.Row, colIndex: number, text: string) {
  const cell = row.getCell(colIndex)
  cell.value = text
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } }
  cell.font = { bold: true, color: { argb: WHITE } }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

// Plain-data shape the actual renderer works from — deliberately independent
// of Prisma's generated types so the rendering logic can be exercised
// directly in a test without a live database (see buildCycleWorkbook below,
// the thin DB-fetching wrapper that's actually used in production).
export type CycleExportSet = { weight: number; reps: number }
export type CycleExportEntry = {
  exerciseId: string
  multiplier: number
  oneRepMax: number | null
  exercise: { name: string; category: string | null; impactCoefficient: number }
  sets: CycleExportSet[]
}
export type CycleExportWorkout = { scheduledDate: string | Date; exerciseEntries: CycleExportEntry[] }
export type CycleExportMicrocycle = { weekNumber: number; workouts: CycleExportWorkout[] }
export type CycleExportData = { name: string; microcycles: CycleExportMicrocycle[] }

/**
 * Renders one training plan (Cycle) into a workbook, laid out to match the
 * original spreadsheet this app replaced: a dark title bar per microcycle
 * (week), a blue column-header row, one block per training day (red weekday
 * badge + a rotated date running down the block), exercise rows color-coded
 * by movement pattern, sets collapsed into Вес/Под/Пов/% groups, and a
 * totals row per day plus a week-total row up in the title bar.
 */
export function renderCycleWorkbook(
  cycle: CycleExportData,
  rpeTable: RpePoint[]
): ExcelJS.Workbook {
  // Every microcycle shares the same column layout (fixed set-group count,
  // sized to whichever exercise in the whole plan needed the most groups) —
  // same as the source workbook, where every week's header row lines up
  // under identical columns.
  let maxGroups = 1
  for (const mc of cycle.microcycles) {
    for (const workout of mc.workouts) {
      for (const entry of workout.exerciseEntries) {
        maxGroups = Math.max(maxGroups, groupSets(entry.sets).length)
      }
    }
  }

  const FIXED_COLS = 4 // Дата, Порядок, Упражнения, Множ
  const GROUP_COLS = 4 // Вес, Под, Пов, %
  const SUMMARY_COLS = 6 // Тоннаж, Сред.вес, Инт.Отн, ПМ, КПШ, КО
  const totalCols = FIXED_COLS + maxGroups * GROUP_COLS + SUMMARY_COLS
  const summaryStart = FIXED_COLS + maxGroups * GROUP_COLS + 1 // 1-based

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'IronLedger'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(safeSheetName(cycle.name))

  sheet.columns = Array.from({ length: totalCols }, (_, i) => {
    const idx = i + 1
    if (idx === 1) return { width: 7 } // Дата
    if (idx === 2) return { width: 6 } // Порядок
    if (idx === 3) return { width: 28 } // Упражнения
    if (idx === 4) return { width: 6 } // Множ
    if (idx >= summaryStart) {
      const offset = idx - summaryStart
      return { width: [9, 9, 9, 6, 6, 7][offset] ?? 8 }
    }
    const offsetInGroup = (idx - FIXED_COLS - 1) % GROUP_COLS
    return { width: [7, 5, 5, 6][offsetInGroup] }
  })

  function resolveExercises(entries: CycleExportEntry[]) {
    return entries.map((e) => ({
      entry: e,
      metrics: computeExerciseMetrics(
        {
          sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          oneRepMax: e.oneRepMax ?? 0,
          impactCoefficient: e.exercise.impactCoefficient,
          multiplier: e.multiplier,
        },
        rpeTable
      ),
      groups: groupSets(e.sets),
    }))
  }

  for (const mc of cycle.microcycles) {
    const daysWithExercises = mc.workouts.filter((w) => w.exerciseEntries.length > 0)

    const weekResolved = daysWithExercises.flatMap((w) => resolveExercises(w.exerciseEntries))
    const weekTotals = aggregateMetrics(weekResolved.map((r) => r.metrics))
    const otherKpsh = weekResolved
      .filter((r) => !isSquatCategory(r.entry.exercise.category) && !isPressCategory(r.entry.exercise.category))
      .reduce((sum, r) => sum + r.metrics.kpsh, 0)

    // Title bar: "Микроцикл N" on the left, "Другие: N" over the set-group
    // area, week totals aligned under the same 6 summary columns their
    // per-day counterparts use below.
    const titleRow = sheet.addRow([])
    titleRow.height = 18
    for (let c = 1; c <= totalCols; c++) {
      titleRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    }
    sheet.mergeCells(titleRow.number, 1, titleRow.number, FIXED_COLS)
    const titleCell = titleRow.getCell(1)
    titleCell.value = `Микроцикл ${mc.weekNumber}`
    titleCell.font = { bold: true, size: 12, color: { argb: WHITE } }
    titleCell.alignment = { vertical: 'middle' }

    if (maxGroups > 0) {
      sheet.mergeCells(titleRow.number, FIXED_COLS + 1, titleRow.number, summaryStart - 1)
      const otherCell = titleRow.getCell(FIXED_COLS + 1)
      otherCell.value = `Другие: ${otherKpsh}`
      otherCell.font = { bold: true, italic: true, color: { argb: RED } }
      otherCell.alignment = { horizontal: 'right', vertical: 'middle' }
    }

    const weekSummaryValues = [
      weekTotals.tonnage,
      weekTotals.avgWeight,
      weekTotals.relativeIntensity,
      null, // ПМ has no meaningful week-level total
      weekTotals.kpsh,
      weekTotals.loadCoefficient,
    ]
    weekSummaryValues.forEach((val, i) => {
      const cell = titleRow.getCell(summaryStart + i)
      cell.value = val
      cell.font = { bold: true, color: { argb: WHITE } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      if (i === 2) cell.numFmt = '0%'
      else if (i !== 3) cell.numFmt = '0'
    })

    // Column header row.
    const headerRow = sheet.addRow([])
    headerRow.height = 16
    headerCell(headerRow, 1, 'Дата')
    headerCell(headerRow, 2, 'Порядок')
    headerCell(headerRow, 3, 'Упражнения')
    headerCell(headerRow, 4, 'Множ')
    for (let g = 0; g < maxGroups; g++) {
      const base = FIXED_COLS + g * GROUP_COLS
      headerCell(headerRow, base + 1, 'Вес')
      headerCell(headerRow, base + 2, 'Под')
      headerCell(headerRow, base + 3, 'Пов')
      headerCell(headerRow, base + 4, '%')
    }
    headerCell(headerRow, summaryStart, 'Тоннаж')
    headerCell(headerRow, summaryStart + 1, 'Сред.вес')
    headerCell(headerRow, summaryStart + 2, 'Инт.Отн')
    headerCell(headerRow, summaryStart + 3, 'ПМ')
    headerCell(headerRow, summaryStart + 4, 'КПШ')
    headerCell(headerRow, summaryStart + 5, 'КО')

    for (const workout of daysWithExercises) {
      const resolved = resolveExercises(workout.exerciseEntries)
      const firstRowNumber = sheet.rowCount + 1

      resolved.forEach(({ entry, metrics, groups }, position) => {
        const row = sheet.addRow([])
        row.height = 15

        row.getCell(2).value = position + 1
        row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' }

        const nameCell = row.getCell(3)
        nameCell.value = entry.exercise.name
        nameCell.font = { bold: true }
        nameCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: categoryFill(entry.exercise.category) },
        }
        nameCell.alignment = { wrapText: true, vertical: 'middle' }

        row.getCell(4).value = entry.multiplier !== 1 ? entry.multiplier : null
        row.getCell(4).alignment = { vertical: 'middle' }

        // Excel's default vertical alignment is "bottom" when unset — fine
        // for a single-line row, but nameCell above can wrap a long
        // exercise name onto 2+ lines and grow the whole row, which then
        // left every load figure sitting on the row's bottom border instead
        // of centered like the exercise name next to it. Explicit
        // vertical: 'middle' on every data cell in the row keeps them
        // aligned with each other regardless of row height.
        const oneRepMax = entry.oneRepMax ?? 0
        groups.slice(0, maxGroups).forEach((g, gi) => {
          const base = FIXED_COLS + gi * GROUP_COLS
          const weightCell = row.getCell(base + 1)
          weightCell.value = g.weight
          weightCell.alignment = { vertical: 'middle' }
          const countCell = row.getCell(base + 2)
          countCell.value = g.count
          countCell.alignment = { vertical: 'middle' }
          const repsCell = row.getCell(base + 3)
          repsCell.value = g.reps
          repsCell.alignment = { vertical: 'middle' }
          if (oneRepMax > 0) {
            const pctCell = row.getCell(base + 4)
            pctCell.value = g.weight / oneRepMax
            pctCell.numFmt = '0%'
            pctCell.alignment = { vertical: 'middle' }
          }
        })

        const summaryVals: [number, unknown, string | undefined][] = [
          [summaryStart, metrics.tonnage, '0'],
          [summaryStart + 1, metrics.avgWeight, '0'],
          [summaryStart + 2, metrics.relativeIntensity, '0%'],
          [summaryStart + 3, oneRepMax || null, undefined],
          [summaryStart + 4, metrics.kpsh, undefined],
          [summaryStart + 5, metrics.loadCoefficient, '0.0'],
        ]
        for (const [col, val, fmt] of summaryVals) {
          const cell = row.getCell(col)
          cell.value = val as ExcelJS.CellValue
          cell.alignment = { vertical: 'middle' }
          if (fmt) cell.numFmt = fmt
        }
      })

      // Weekday badge on the block's first row; the actual date runs
      // rotated 90° down the remaining rows (or, for a single-exercise day,
      // shares the one row with the badge instead of a degenerate merge).
      const lastRowNumber = sheet.rowCount
      const weekday = WEEKDAY_SHORT[new Date(workout.scheduledDate).getUTCDay()]
      const dateLabel = new Date(workout.scheduledDate).toISOString().slice(0, 10).split('-').reverse().join('.')

      const badgeCell = sheet.getRow(firstRowNumber).getCell(1)
      badgeCell.value = resolved.length > 1 ? weekday : `${weekday} ${dateLabel}`
      badgeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } }
      badgeCell.font = { bold: true, color: { argb: WHITE } }
      badgeCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

      if (resolved.length > 1) {
        sheet.mergeCells(firstRowNumber + 1, 1, lastRowNumber, 1)
        const dateCell = sheet.getRow(firstRowNumber + 1).getCell(1)
        dateCell.value = dateLabel
        dateCell.font = { bold: true }
        dateCell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 }
      }

      // Day-total row.
      const dayTotals = aggregateMetrics(resolved.map((r) => r.metrics))
      const totalRow = sheet.addRow([])
      totalRow.height = 15
      const dayVals: [number, unknown, string | undefined][] = [
        [summaryStart, dayTotals.tonnage, '0'],
        [summaryStart + 1, dayTotals.avgWeight, '0'],
        [summaryStart + 2, dayTotals.relativeIntensity, '0%'],
        [summaryStart + 4, dayTotals.kpsh, undefined],
        [summaryStart + 5, dayTotals.loadCoefficient, '0.0'],
      ]
      for (const [col, val, fmt] of dayVals) {
        const cell = totalRow.getCell(col)
        cell.value = val as ExcelJS.CellValue
        cell.font = { bold: true, color: { argb: TOTAL_TEXT } }
        if (fmt) cell.numFmt = fmt
      }
    }
  }

  return workbook
}

/**
 * Thin DB-fetching wrapper around renderCycleWorkbook — this is what the
 * export API route actually calls. Kept separate so the rendering logic
 * itself can be tested with plain data, no live database required.
 */
export async function buildCycleWorkbook(cycleId: string): Promise<ExcelJS.Workbook> {
  const cycle = await prisma.cycle.findUnique({
    where: { id: cycleId },
    include: {
      microcycles: {
        orderBy: { weekNumber: 'asc' },
        include: {
          workouts: {
            orderBy: { scheduledDate: 'asc' },
            include: {
              exerciseEntries: {
                orderBy: { orderIndex: 'asc' },
                include: { exercise: true, sets: { orderBy: { setNumber: 'asc' } } },
              },
            },
          },
        },
      },
    },
  })
  if (!cycle) throw new Error('Цикл не найден')

  const rpeTable: RpePoint[] = (await prisma.rpeTable.findMany()).map((r) => ({
    reps: r.reps,
    rpe: r.rpe,
    percent1rm: r.percent1rm,
  }))

  return renderCycleWorkbook(cycle, rpeTable)
}

export type { ExerciseMetrics }
