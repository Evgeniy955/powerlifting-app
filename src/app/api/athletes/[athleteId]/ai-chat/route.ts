import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { buildAthleteSummary } from '@/lib/aiInsights'
import {
  GeminiAiNotConfiguredError,
  getCoachAiReply,
  type CoachAiMessage,
} from '@/lib/coachAgent'
import { DEFAULT_COACH_AI_MODEL, isCoachAiModel } from '@/lib/coachAiModels'

type RequestBody = {
  messages?: unknown
  cycleId?: unknown
  model?: unknown
}

type CycleWithWorkouts = NonNullable<
  Awaited<ReturnType<typeof getCycleForCoach>>
>

async function getCycleForCoach(cycleId: string, athleteId: string) {
  return prisma.cycle.findFirst({
    where: { id: cycleId, athleteId },
    select: {
      id: true,
      name: true,
      microcycles: {
        orderBy: { weekNumber: 'asc' },
        select: {
          id: true,
          weekNumber: true,
          workouts: {
            orderBy: { scheduledDate: 'asc' },
            select: {
              scheduledDate: true,
              dayNumber: true,
              exerciseEntries: {
                orderBy: { orderIndex: 'asc' },
                select: {
                  exercise: { select: { name: true } },
                  sets: {
                    orderBy: { setNumber: 'asc' },
                    select: { weight: true, reps: true, rpe: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
}

function formatCyclePlan(cycle: CycleWithWorkouts): string {
  const today = new Date()
  const completed = cycle.microcycles.filter((microcycle) =>
    microcycle.workouts.length > 0 && microcycle.workouts.every((workout) => workout.scheduledDate < today)
  )
  const upcoming = cycle.microcycles.filter((microcycle) =>
    microcycle.workouts.some((workout) => workout.scheduledDate >= today)
  )
  const selected = [...completed.slice(-2), ...upcoming.slice(0, 2)]
  const microcycles = selected.length > 0 ? selected : cycle.microcycles.slice(-2)

  if (microcycles.length === 0) return 'В выбранном мезоцикле пока нет тренировок.'

  return microcycles
    .map((microcycle) => {
      const workouts = microcycle.workouts
        .map((workout) => {
          const exercises = workout.exerciseEntries
            .map((entry) => {
              const sets = entry.sets
                .map((set) => `${set.weight}×${set.reps}${set.rpe ? ` @${set.rpe}` : ''}`)
                .join(', ')
              return `${entry.exercise.name}${sets ? ` (${sets})` : ''}`
            })
            .join('; ')
          return `день ${workout.dayNumber} (${workout.scheduledDate.toISOString().slice(0, 10)}): ${exercises || 'без упражнений'}`
        })
        .join('\n  ')
      return `Неделя ${microcycle.weekNumber}:\n  ${workouts || 'нет тренировочных дней'}`
    })
    .join('\n')
}

function parseMessages(value: unknown): CoachAiMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return null

  const messages: CoachAiMessage[] = []
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('role' in item) ||
      !('content' in item) ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.content !== 'string'
    ) {
      return null
    }
    const content = item.content.trim()
    if (content.length === 0 || content.length > 4000) return null
    messages.push({ role: item.role, content })
  }
  return messages
}

// Coach-only embedded Gemini chat. The model receives a compact factual
// summary, never a database connection or credentials; ownership is verified
// before a paid provider request is made.
export async function POST(req: NextRequest, props: { params: Promise<{ athleteId: string }> }) {
  const params = await props.params;
  try {
    const coach = await requireCoach()
    const body = (await req.json().catch(() => null)) as RequestBody | null
    const messages = parseMessages(body?.messages)
    if (!messages) {
      return NextResponse.json({ error: 'Некорректное сообщение чата' }, { status: 400 })
    }
    if (body?.model !== undefined && !isCoachAiModel(body.model)) {
      return NextResponse.json({ error: 'Некорректная модель AI' }, { status: 400 })
    }
    const model = body?.model ?? DEFAULT_COACH_AI_MODEL

    const athlete = await prisma.athleteProfile.findUnique({
      where: { id: params.athleteId },
      include: { user: { select: { name: true, email: true } } },
    })
    if (!athlete) return NextResponse.json({ error: 'Атлет не найден' }, { status: 404 })
    if (athlete.coachId !== coach.id) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const cycleId = typeof body?.cycleId === 'string' ? body.cycleId : undefined
    const cycle = cycleId ? await getCycleForCoach(cycleId, athlete.id) : null
    if (cycleId && !cycle) return NextResponse.json({ error: 'Мезоцикл не найден' }, { status: 404 })

    const summary = await buildAthleteSummary(athlete.id)
    if (!summary) return NextResponse.json({ error: 'Атлет не найден' }, { status: 404 })

    const origin = new URL(req.url).origin
    const text = await getCoachAiReply(
      messages,
      {
        athleteName: summary.athleteName,
        trainingSummary: summary.summary,
        cycleName: cycle?.name,
        cyclePlanSummary: cycle ? formatCyclePlan(cycle) : undefined,
        links: {
          mesocycle: cycle ? `${origin}/cycles/${cycle.id}` : `${origin}/cycles/`,
          microcycle: `${origin}/microcycle/`,
          workout: `${origin}/workout/`,
        },
      },
      model
    )
    return NextResponse.json({ text })
  } catch (error) {
    if (error instanceof GeminiAiNotConfiguredError) {
      return NextResponse.json({ error: 'AI не настроен' }, { status: 501 })
    }
    return apiErrorResponse(error)
  }
}
