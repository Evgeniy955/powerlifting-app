import JSZip from 'jszip'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
import { parseGymPlanText } from '@/lib/gymImportParser'
import { matchGymExercises } from '@/lib/gymExerciseMatch'

const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

async function extractText(file: Blob, mimeType: string): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer())

  if (mimeType === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    const text = result.text.trim()
    if (!text) throw new Error('PDF не содержит распознаваемый текст')
    return text
  }

  const archive = await JSZip.loadAsync(buffer)
  const document = archive.file('word/document.xml')
  if (!document) throw new Error('DOCX не содержит текст документа')
  const xml = await document.async('text')
  const text = xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim()
    .slice(0, 500000)
  if (!text) throw new Error('DOCX не содержит распознаваемый текст')
  return text
}

// POST /api/gym/athletes/:athleteId/imports/preview { assessmentId } —
// parses the previously-uploaded DOCX/PDF and matches every exercise name
// it found against the gym exercise catalog (exact match, or a
// possible-duplicate suggestion — see gymExerciseMatch.ts). Nothing is
// written to the DB by this step; the coach reviews unmatched names on the
// import screen and POSTs their resolution to .../imports/confirm. Mirrors
// /api/athletes/:athleteId/import/preview on the powerlifting side.
export async function POST(req: Request, { params }: { params: Promise<{ athleteId: string }> }) {
  try {
    const coach = await requireCoach()
    const { athleteId: clientId } = await params
    await assertGymClientBelongsToCoach(clientId, coach.id)

    const body = await req.json() as { assessmentId?: unknown }
    if (typeof body.assessmentId !== 'string') {
      return NextResponse.json({ error: 'Не указан импортированный файл' }, { status: 400 })
    }
    const assessment = await prisma.gymClientAssessment.findFirst({
      where: { id: body.assessmentId, clientId },
    })
    if (!assessment || !DOCUMENT_TYPES.has(assessment.mimeType)) {
      return NextResponse.json({ error: 'Документ для импорта не найден' }, { status: 404 })
    }

    const storage = await createClient()
    const { data: file, error: downloadError } = await storage.storage.from('assessments').download(assessment.storagePath)
    if (downloadError || !file || file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Не удалось прочитать импортированный файл' }, { status: 502 })
    }

    const text = await extractText(file, assessment.mimeType)
    const parsed = parseGymPlanText(text, assessment.fileName.replace(/\.[^.]+$/, ''))

    if (!parsed.workouts.length) {
      return NextResponse.json({
        error: 'Не удалось распознать упражнения в документе. Поддерживаются строки вида ' +
          '"Упражнение 120 4х6" или "Упражнение 120 4/6" (вес, подходы, повторы).',
      }, { status: 422 })
    }

    const catalog = await prisma.gymExerciseCatalog.findMany()
    const exerciseMatches = matchGymExercises(parsed, catalog)

    return NextResponse.json({ parsed, exerciseMatches })
  } catch (error) {
    if (error instanceof Error && /не содержит/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    return apiErrorResponse(error)
  }
}
