import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireUser, apiErrorResponse } from '@/lib/session'
import { assertGymCanAccessEntry } from '@/lib/authorization'

// Adding a set is a set-level action (see /api/gym/sets/:setId) — coach or
// the entry's own client, not coach-only.
export async function POST(_: Request, { params }: { params: Promise<{ entryId: string }> }) {
  try {
    const user = await requireUser(); const { entryId } = await params
    await assertGymCanAccessEntry(entryId, user)
    const previous = await prisma.gymSetEntry.findFirst({ where: { entryId }, orderBy: { setNumber: 'desc' } })
    const set = await prisma.gymSetEntry.create({ data: { entryId, setNumber: (previous?.setNumber ?? 0) + 1, weight: previous?.weight ?? 0, reps: previous?.reps ?? 10 } })
    return NextResponse.json(set, { status: 201 })
  } catch (error) { return apiErrorResponse(error) }
}
