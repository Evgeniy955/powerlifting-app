import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessExerciseEntry } from '@/lib/authorization'

// POST /api/exercise-entries/:entryId/sets — "+ Добавить подход".
// Always appends an EMPTY set (weight/reps left for the user to fill in) —
// no auto-fill from the previous set, per product decision.
export async function POST(_req: NextRequest, { params }: { params: { entryId: string } }) {
  try {
    const user = await requireUser()
    await assertCanAccessExerciseEntry(params.entryId, user)
    const maxSet = await prisma.setEntry.aggregate({
      where: { exerciseEntryId: params.entryId },
      _max: { setNumber: true },
    })
    const set = await prisma.setEntry.create({
      data: {
        exerciseEntryId: params.entryId,
        setNumber: (maxSet._max.setNumber ?? 0) + 1,
        weight: 0,
        reps: 0,
      },
    })
    return NextResponse.json(set, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
