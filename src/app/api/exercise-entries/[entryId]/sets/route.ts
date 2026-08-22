import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessExerciseEntry } from '@/lib/authorization'

// POST /api/exercise-entries/:entryId/sets — "+" next to the last set.
// Duplicates the last set's weight/reps (a coach programming e.g. 5x5 clicks
// this repeatedly instead of retyping the same numbers into each new row) —
// completed always starts false, since it's a fresh set still to be done.
// No previous set yet -> nothing to duplicate, starts at 0/0 same as before.
export async function POST(_req: NextRequest, { params }: { params: { entryId: string } }) {
  try {
    const user = await requireUser()
    await assertCanAccessExerciseEntry(params.entryId, user)
    const lastSet = await prisma.setEntry.findFirst({
      where: { exerciseEntryId: params.entryId },
      orderBy: { setNumber: 'desc' },
    })
    const set = await prisma.setEntry.create({
      data: {
        exerciseEntryId: params.entryId,
        setNumber: (lastSet?.setNumber ?? 0) + 1,
        weight: lastSet?.weight ?? 0,
        reps: lastSet?.reps ?? 0,
      },
    })
    return NextResponse.json(set, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
