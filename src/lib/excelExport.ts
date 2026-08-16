import ExcelJS from 'exceljs'
import { prisma } from './prisma'
import { computeExerciseMetrics } from './metrics'
import { getWeeklyLoadDistribution } from './analytics'
import type { RpePoint } from './rpe'

const ZONE_FILL = {
  low: 'FF4ADE80', // <70%
  moderate: 'FFFBBF24', // 70-85%
  high: 'FFFB923C', // 85-95%
  max: 'FFF87171', // >95%
} as const

function zoneFill(relativeIntensity: number): string {
  if (relativeIntensity >= 0.95) return ZONE_FILL.max
  if (relativeIntensity >= 0.85) return ZONE_FILL.high
  if (relativeIntensity >= 0.7) return ZONE_FILL.moderate
  return ZONE_FILL.low
}

function safeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no []:*?/\\
  return name.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31) || 'Cycle'
}

/**
 * Builds a readable .xlsx workbook for one athlete: one sheet per cycle (dates,
 * exercises, sets written out as "вес×повт" pairs, and the same metric columns as
 * the app — tonnage, avg weight, %1RM, KPSH, load coefficient, fatigue index),
 * a "Сводка" sheet with weekly totals, and progress sheets for tracked exercises —
 * mirroring the readability of the original Excel workbook this app replaces.
 */
export async function buildAthleteWorkbook(athleteId: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'IronLedger'
  workbook.created = new Date()

  const rpeTable: RpePoint[] = (await prisma.rpeTable.findMany()).map((r) => ({
    reps: r.reps,
    rpe: r.rpe,
    percent1rm: r.percent1rm,
  }))

  const oneRepMaxes = await prisma.athlete1RM.findMany({ where: { athleteId } })
  const oneRepMaxByExercise = new Map(oneRepMaxes.map((rm) => [rm.exerciseId, rm.value]))

  const cycles = await prisma.cycle.findMany({
    where: { athleteId },
    orderBy: { startDate: 'asc' },
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

  const headerRow = [
    'Дата',
    'Неделя',
    'Упражнение',
    'Подходы (вес×повт)',
    'Тоннаж',
    'Сред.вес',
    'Интенсивность',
    'КПШ',
    'КО',
    'Индекс усталости',
  ]

  for (const cycle of cycles) {
    const sheet = workbook.addWorksheet(safeSheetName(cycle.name))
    sheet.views = [{ state: 'frozen', ySplit: 1 }]

    const header = sheet.addRow(headerRow)
    header.font = { bold: true }
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2430' } }
      cell.font = { bold: true, color: { argb: 'FFE8ECF1' } }
    })

    for (const mc of cycle.microcycles) {
      for (const workout of mc.workouts) {
        for (const entry of workout.exerciseEntries) {
          const oneRepMax = oneRepMaxByExercise.get(entry.exerciseId) ?? 0
          const metrics = computeExerciseMetrics(
            {
              sets: entry.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
              oneRepMax,
              impactCoefficient: entry.exercise.impactCoefficient,
              multiplier: entry.multiplier,
            },
            rpeTable
          )
          const setsText = entry.sets
            .filter((s) => s.weight > 0 && s.reps > 0)
            .map((s) => `${s.weight}×${s.reps}`)
            .join(', ')

          const row = sheet.addRow([
            workout.scheduledDate.toISOString().slice(0, 10),
            mc.weekNumber,
            entry.exercise.name,
            setsText,
            metrics.tonnage,
            metrics.avgWeight,
            metrics.relativeIntensity ? Math.round(metrics.relativeIntensity * 100) + '%' : '',
            metrics.kpsh,
            metrics.loadCoefficient,
            metrics.fatigueIndex,
          ])

          const intensityCell = row.getCell(7)
          if (metrics.relativeIntensity > 0) {
            intensityCell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: zoneFill(metrics.relativeIntensity) },
            }
          }
        }
      }
    }

    sheet.columns.forEach((col) => {
      let maxLen = 10
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length
        if (len > maxLen) maxLen = len
      })
      col.width = Math.min(maxLen + 2, 40)
    })
  }

  // Summary sheet: weekly tonnage/KPSH/etc across the whole athlete history.
  const summarySheet = workbook.addWorksheet('Сводка')
  summarySheet.views = [{ state: 'frozen', ySplit: 1 }]
  const summaryHeader = summarySheet.addRow([
    'Цикл',
    'Неделя',
    'Тоннаж',
    'КПШ',
    'Сред.вес',
    'КО',
    'Индекс усталости',
  ])
  summaryHeader.font = { bold: true }
  summaryHeader.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2430' } }
    cell.font = { bold: true, color: { argb: 'FFE8ECF1' } }
  })

  const weeklyLoad = await getWeeklyLoadDistribution(athleteId, rpeTable)
  for (const w of weeklyLoad) {
    summarySheet.addRow([
      w.cycleName,
      w.weekNumber,
      w.tonnage,
      w.kpsh,
      w.avgWeight,
      w.loadCoefficient,
      w.fatigueIndex,
    ])
  }
  summarySheet.columns.forEach((col) => (col.width = 16))

  return workbook
}
