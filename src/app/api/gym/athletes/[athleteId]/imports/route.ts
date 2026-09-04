import JSZip from 'jszip'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { estimateGymOneRepMax } from '@/lib/gym'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'
import { parseGymPlanText, type ImportedExercise, type ImportedWorkout } from '@/lib/gymImportParser'

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
    const workouts: ImportedWorkout[] = parsed.workouts

    if (!workouts.length) {
      return NextResponse.json({
        error: 'Не удалось распознать упражнения в документе. Поддерживаются строки вида ' +
          '"Упражнение 120 4х6" или "Упражнение 120 4/6" (вес, подходы, повторы).',
      }, { status: 422 })
    }

    const plan = await prisma.$transaction(async (tx) => {
      const maxes = await tx.gymClientMax.findMany({ where: { clientId } })
      const maxByExercise = new Map(maxes.map((max) => [max.exerciseId, max.value]))
      const prepared = [] as { week: number; day: number; exercises: (ImportedExercise & { exerciseId: string; resolvedMax: number | null })[] }[]

      for (const workout of workouts) {
        const exercises = [] as (ImportedExercise & { exerciseId: string; resolvedMax: number | null })[]
        for (const exercise of workout.exercises) {
          const catalogExercise = await tx.gymExerciseCatalog.upsert({
            where: { name: exercise.name },
            create: { name: exercise.name, category: 'Импорт' },
            update: {},
          })
          const currentMax = maxByExercise.get(catalogExercise.id)
          const firstWeightedSet = exercise.sets.find((set) => set.weight > 0) ?? exercise.sets[0]
          const estimatedMax = firstWeightedSet.weight > 0
            ? estimateGymOneRepMax(firstWeightedSet.weight, firstWeightedSet.reps)
            : null
          const resolvedMax = (!currentMax ? estimatedMax : null) ?? currentMax ?? null
          if (estimatedMax && !currentMax) {
            await tx.gymClientMax.upsert({
              where: { clientId_exerciseId: { clientId, exerciseId: catalogExercise.id } },
              create: { clientId, exerciseId: catalogExercise.id, value: estimatedMax },
              update: { value: estimatedMax },
            })
            maxByExercise.set(catalogExercise.id, estimatedMax)
          }
          exercises.push({ ...exercise, exerciseId: catalogExercise.id, resolvedMax })
        }
        prepared.push({ week: workout.week, day: workout.day, exercises })
      }

      const startDate = new Date()
      return tx.gymPlan.create({
        data: {
          clientId,
          name: parsed.name,
          weeks: parsed.weeks,
          startDate,
          weeksData: {
            create: Array.from({ length: parsed.weeks }, (_, index) => {
              const weekNumber = index + 1
              return {
                weekNumber,
                workouts: {
                  create: prepared
                    .filter((workout) => workout.week === weekNumber)
                    .map((workout) => ({
                      dayNumber: workout.day,
                      scheduledDate: new Date(startDate.getTime() + ((weekNumber - 1) * 7 + workout.day - 1) * 86400000),
                      entries: {
                        create: workout.exercises.map((exercise, orderIndex) => ({
                          exerciseId: exercise.exerciseId,
                          orderIndex,
                          oneRepMax: exercise.resolvedMax,
                          sets: {
                            create: exercise.sets.map((set, setIndex) => ({
                              setNumber: setIndex + 1,
                              weight: set.weight,
                              reps: set.reps,
                            })),
                          },
                        })),
                      },
                    })),
                },
              }
            }),
          },
        },
      })
    })

    return NextResponse.json({
      planId: plan.id,
      workouts: workouts.length,
      unmatchedLines: parsed.unmatchedLines,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && /не содержит/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    return apiErrorResponse(error)
  }
}
