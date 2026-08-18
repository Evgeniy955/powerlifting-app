import ExcelJS from 'exceljs'
import { prisma } from './prisma'

export type ParsedSet = { weight: number; reps: number }

export type ParsedExerciseRow = {
  date: string // ISO date
  sheetName: string
  rowNumber: number
  rawName: string
  matchedExerciseId: string | null
  matchedExerciseName: string | null
  oneRepMax: number | null
  sets: ParsedSet[]
}

export type ImportPreview = {
  recognized: ParsedExerciseRow[]
  unrecognized: ParsedExerciseRow[]
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'object' && v && 'richText' in (v as Record<string, unknown>)) {
    const rt = (v as { richText: { text: string }[] }).richText
    return rt.map((t) => t.text).join('').trim()
  }
  if (typeof v === 'object' && v && 'result' in (v as Record<string, unknown>)) {
    const r = (v as { result: unknown }).result
    // Broken/leftover formulas (e.g. "#REF!" from rows deleted in the original
    // workbook) come back as { error: "#REF!" } — treat as no value, not text.
    if (r == null || (typeof r === 'object' && 'error' in (r as Record<string, unknown>))) {
      return ''
    }
    return String(r).trim()
  }
  return String(v).trim()
}

function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value as unknown
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v && 'result' in (v as Record<string, unknown>)) {
    const r = (v as { result: unknown }).result
    if (typeof r === 'number') return r
  }
  return 0
}

function cellDate(cell: ExcelJS.Cell): Date | null {
  const v = cell.value as unknown
  if (v instanceof Date) return v
  // Most dates in the original workbook are formulas like "=A15+1" (previous date
  // + offset), which ExcelJS returns as { formula, result } rather than a Date —
  // without this, only the very first hardcoded date in the sheet would ever be seen.
  if (typeof v === 'object' && v && 'result' in (v as Record<string, unknown>)) {
    const r = (v as { result: unknown }).result
    if (r instanceof Date) return r
    if (typeof r === 'string') {
      const d = new Date(r)
      if (!isNaN(d.getTime())) return d
    }
  }
  return null
}

// Matches a lone tempo/pause annotation like "10сек", "10 сек", "10секунд", "10с",
// "10с." — the original sheet sometimes puts follow-up sets of the *same* exercise
// on their own row without repeating the exercise name, using just the pause
// duration as the "name". Never a real exercise on its own.
const TEMPO_NOTE_PATTERN = /^\d+\s*с(?:ек(?:унд[а-я]*)?)?\.?$/i

type HeaderMap = {
  dateCol: number
  exerciseCol: number
  oneRepMaxCol: number | null
  setBlocks: { weightCol: number; setsCol: number; repsCol: number }[]
}

function findHeader(row: ExcelJS.Row): HeaderMap | null {
  let dateCol = -1
  let exerciseCol = -1
  let oneRepMaxCol: number | null = null
  const weightCols: number[] = []
  const textByCol = new Map<number, string>()

  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell)
    textByCol.set(colNumber, text)
    if (text === 'Дата') dateCol = colNumber
    if (text.startsWith('Упражн')) exerciseCol = colNumber
    if (text === 'ПМ') oneRepMaxCol = colNumber
    if (text === 'Вес') weightCols.push(colNumber)
  })

  if (dateCol === -1 || exerciseCol === -1) return null

  const setBlocks = weightCols
    .filter((col) => textByCol.get(col + 1) === 'Под' && textByCol.get(col + 2) === 'Пов')
    .map((col) => ({ weightCol: col, setsCol: col + 1, repsCol: col + 2 }))

  if (setBlocks.length === 0) return null

  return { dateCol, exerciseCol, oneRepMaxCol, setBlocks }
}

/**
 * Parses an uploaded workbook by locating any sheet whose header row contains
 * "Дата" + "Упражнение(я)" + repeating "Вес/Под/Пов" set blocks — the same layout
 * as the original spreadsheet's "1 в день" sheet — rather than hardcoding column
 * letters, so it tolerates sheets that don't match this exact template 1:1.
 *
 * Every row is returned for coach review before anything is written to the DB;
 * nothing here touches the database except read-only exercise-name matching.
 */
export async function parseWorkbookPreview(buffer: Buffer): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  const catalog = await prisma.exerciseCatalog.findMany()
  const byNormalizedName = new Map(catalog.map((e) => [e.name.trim().toLowerCase(), e]))

  const recognized: ParsedExerciseRow[] = []
  const unrecognized: ParsedExerciseRow[] = []

  workbook.eachSheet((sheet) => {
    let header: HeaderMap | null = null
    let headerRowNumber = -1

    for (let r = 1; r <= Math.min(30, sheet.rowCount); r++) {
      const candidate = findHeader(sheet.getRow(r))
      if (candidate) {
        header = candidate
        headerRowNumber = r
        break
      }
    }
    if (!header) return // this sheet doesn't look like a training log

    // Each training day is a block of rows: it starts on a row carrying a short
    // weekday label ("Пн", "Вт", ...) in the date column, and the *literal* date
    // usually only appears one row further down, within that same block — not on
    // the label row itself. A naive "carry the last seen date forward" scan
    // therefore misattributes every block's first exercise to the *previous*
    // day. Instead: find each block's boundaries via the weekday label, then
    // resolve one date per block by scanning inside it, then assign that date to
    // every row in the block.
    const WEEKDAYS = new Set(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'])
    const dateForRow = new Map<number, Date>()

    let cursor = headerRowNumber + 1
    while (cursor <= sheet.rowCount) {
      const label = cellText(sheet.getRow(cursor).getCell(header.dateCol))
      if (!WEEKDAYS.has(label)) {
        cursor++
        continue
      }

      let blockEnd = cursor + 1
      while (blockEnd <= sheet.rowCount) {
        const t = cellText(sheet.getRow(blockEnd).getCell(header.dateCol))
        if (WEEKDAYS.has(t)) break
        blockEnd++
      }

      let blockDate: Date | null = null
      for (let r = cursor; r < blockEnd; r++) {
        const d = cellDate(sheet.getRow(r).getCell(header.dateCol))
        if (d) {
          blockDate = d
          break
        }
      }
      if (blockDate) {
        for (let r = cursor; r < blockEnd; r++) dateForRow.set(r, blockDate)
      }

      cursor = blockEnd
    }

    // Tracks the most recently emitted row (recognized or not) so a following
    // tempo-note-only row ("10сек") can be folded into it — see TEMPO_NOTE_PATTERN.
    let lastEntry: ParsedExerciseRow | null = null

    for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r)

      const currentDate = dateForRow.get(r) ?? null
      const rawName = cellText(row.getCell(header.exerciseCol))
      if (!rawName || !currentDate) continue

      const sets: ParsedSet[] = []
      for (const block of header.setBlocks) {
        const weight = cellNumber(row.getCell(block.weightCol))
        const setCount = cellNumber(row.getCell(block.setsCol))
        const reps = cellNumber(row.getCell(block.repsCol))
        if (weight > 0 && setCount > 0 && reps > 0) {
          for (let i = 0; i < setCount; i++) sets.push({ weight, reps })
        }
      }
      if (sets.length === 0) continue

      const dateStr = currentDate.toISOString().slice(0, 10)

      // Not a separate exercise — extra sets of whatever came right before it,
      // same day. Merge into that row rather than surfacing "10сек" as an
      // unrecognized exercise name the coach would otherwise have to dismiss.
      if (TEMPO_NOTE_PATTERN.test(rawName) && lastEntry && lastEntry.date === dateStr) {
        lastEntry.sets.push(...sets)
        continue
      }

      const oneRepMax = header.oneRepMaxCol ? cellNumber(row.getCell(header.oneRepMaxCol)) : 0
      const match = byNormalizedName.get(rawName.trim().toLowerCase())

      const parsed: ParsedExerciseRow = {
        date: dateStr,
        sheetName: sheet.name,
        rowNumber: r,
        rawName,
        matchedExerciseId: match?.id ?? null,
        matchedExerciseName: match?.name ?? null,
        oneRepMax: oneRepMax > 0 ? oneRepMax : null,
        sets,
      }

      if (match) recognized.push(parsed)
      else unrecognized.push(parsed)
      lastEntry = parsed
    }
  })

  return { recognized, unrecognized }
}
