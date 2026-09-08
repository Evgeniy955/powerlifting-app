import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, apiErrorResponse } from '@/lib/session'
import { assertGymClientBelongsToCoach } from '@/lib/authorization'

const GROUP_TYPES = new Set(['SUPERSET', 'DROPSET'])
// Combining more than 3 exercises into one round stops reading as a single
// "do these back to back" block and starts being its own mini-circuit — the
// coach can still build that by chaining several groups, this just keeps
// each group small enough that the grouped UI (shared border/label, entries
// laid out side by side) stays readable.
const MAX_GROUP_SIZE = 3

// POST /api/gym/workouts/:workoutId/entries { exerciseIds, groupType } —
// combines 2-3 already-existing exercise entries in this workout into one
// superset/dropset block. Weight/reps/sets on each entry are untouched —
// this only stamps a shared groupId + groupType so the workout view can
// render them together; GymExerciseEntry.groupId's own doc comment has the
// full reasoning. The member entries are also renumbered to sit next to
// each other (in the order given) so the group reads as one visual block
// instead of its members staying scattered among ungrouped exercises.
export async function POST(req: Request, { params }: { params: Promise<{ workoutId: string }> }) {
  try {
    const coach = await requireCoach()
    const { workoutId } = await params
    const workout = await prisma.gymWorkout.findUnique({ where: { id: workoutId }, include: { week: { include: { plan: true } } } })
    if (!workout) return NextResponse.json({ error: 'Тренировка не найдена' }, { status: 404 })
    await assertGymClientBelongsToCoach(workout.week.plan.clientId, coach.id)

    const body = (await req.json()) as { exerciseIds?: unknown; groupType?: unknown }
    const entryIds = Array.isArray(body.exerciseIds) ? body.exerciseIds.filter((id): id is string => typeof id === 'string') : []
    const groupType = typeof body.groupType === 'string' ? body.groupType : ''
    if (!GROUP_TYPES.has(groupType)) return NextResponse.json({ error: 'Некорректный тип группы' }, { status: 400 })
    if (entryIds.length < 2 || entryIds.length > MAX_GROUP_SIZE) {
      return NextResponse.json({ error: `Выберите от 2 до ${MAX_GROUP_SIZE} упражнений` }, { status: 400 })
    }
    if (new Set(entryIds).size !== entryIds.length) return NextResponse.json({ error: 'Упражнение выбрано дважды' }, { status: 400 })

    const entries = await prisma.gymExerciseEntry.findMany({ where: { id: { in: entryIds }, workoutId } })
    if (entries.length !== entryIds.length) return NextResponse.json({ error: 'Упражнение не найдено в этой тренировке' }, { status: 404 })

    // Insert the new block at the position of the first selected entry (in
    // the order the caller listed them) — find where that anchor entry
    // currently sits among all of the workout's entries and splice the
    // (now-ordered) group in at that spot; every other entry keeps its
    // relative order, just shifted to make room, same as a manual drag-to-
    // reorder would produce.
    const allEntries = (await prisma.gymWorkout.findUnique({ where: { id: workoutId } }).entries({ orderBy: { orderIndex: 'asc' } })) ?? []
    const orderedIds = allEntries.map((e) => e.id)
    const anchorPos = orderedIds.indexOf(entryIds[0])
    const remaining = orderedIds.filter((id) => !entryIds.includes(id))
    const insertAt = remaining.filter((id) => orderedIds.indexOf(id) < anchorPos).length
    const finalOrder = [...remaining.slice(0, insertAt), ...entryIds, ...remaining.slice(insertAt)]

    const groupId = randomUUID()
    await prisma.$transaction(
      finalOrder.map((id, index) =>
        prisma.gymExerciseEntry.update({
          where: { id },
          data: entryIds.includes(id) ? { orderIndex: index, groupId, groupType } : { orderIndex: index },
        })
      )
    )

    const updated = await prisma.gymExerciseEntry.findMany({
      where: { workoutId },
      orderBy: { orderIndex: 'asc' },
      include: { exercise: true, sets: true },
    })
    return NextResponse.json(updated, { status: 201 })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
