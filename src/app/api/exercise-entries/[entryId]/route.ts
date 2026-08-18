import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'
import { assertCanAccessExerciseEntry } from '@/lib/authorization'

// PATCH /api/exercise-entries/:entryId { skipped? } — toggles the "didn't get to
// this exercise" flag. Coach or athlete, same access rule as everything else on
// the workout (assertCanAccessExerciseEntry).
export async function PATCH(req: NextRequest, { params }: { params: { entryId: string } }) {
  try {
    const user = await requireUser()
    await assertCanAccessExerciseEntry(params.entryId, user)

    const body = (await req.json()) as { skipped?: boolean }
    const entry = await prisma.exerciseEntry.update({
      where: { id: params.entryId },
      data: body,
    })

    return NextResponse.json(entry)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
