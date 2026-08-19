import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCoach, statusForAuthError } from '@/lib/session'

// GET /api/admin/exercises — coach-only full catalog listing for the admin
// management page. Unlike the public /api/exercises search (capped at 20,
// used by the workout autocomplete), this returns everything, plus usage
// counts so the UI can warn before a destructive delete.
export async function GET() {
  try {
    await requireCoach()
    const exercises = await prisma.exerciseCatalog.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { exerciseEntries: true, oneRepMaxes: true } },
      },
    })
    return NextResponse.json(exercises)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
