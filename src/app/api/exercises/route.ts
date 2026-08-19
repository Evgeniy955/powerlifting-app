import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireUser, statusForAuthError } from '@/lib/session'

// GET /api/exercises?q=присед — autocomplete search over the exercise catalog.
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    const exercises = await prisma.exerciseCatalog.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: 20,
    })
    return NextResponse.json(exercises)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}

// POST /api/exercises — coach can add a custom exercise not in the seeded
// catalog. Called both from the workout-page "Создать «...»" quick-add and
// from the admin exercise page's own "Добавить упражнение" form. New rows
// get category=null (shown as uncategorized) and trainingGroup=null (shown
// under "Без блока") until a coach sorts them from the admin page.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    if (user.role !== 'COACH') {
      return NextResponse.json({ error: 'Доступно только тренеру' }, { status: 403 })
    }
    const body = await req.json()
    const { name, category, impactCoefficient } = body as {
      name: string
      category?: string | null
      impactCoefficient?: number
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    }
    const exercise = await prisma.exerciseCatalog.create({
      data: {
        name: name.trim(),
        category: category?.trim() || null,
        impactCoefficient: impactCoefficient ?? 1.0,
      },
    })
    // The admin exercise list is a Server Component page — without this,
    // Next.js's client-side route cache can keep showing the pre-creation
    // list for up to 30s (or until a hard reload) after navigating there via
    // a <Link>, which looked like "the new exercise doesn't show up at all".
    revalidatePath('/admin/exercises')
    return NextResponse.json(exercise, { status: 201 })
  } catch (e) {
    // Unique constraint on ExerciseCatalog.name (P2002) — surface as a
    // normal 400, not a 500.
    if (typeof e === 'object' && e !== null && 'code' in e && e.code === 'P2002') {
      return NextResponse.json(
        { error: 'Упражнение с таким названием уже существует' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: String(e) }, { status: statusForAuthError(e) })
  }
}
